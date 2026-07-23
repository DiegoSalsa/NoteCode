import { createECDH, createHash } from "crypto";
import webPush from "web-push";
import { prisma } from "@/lib/prisma";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  severity?: string;
};

let configured = false;
let resolvedKeys: { publicKey: string; privateKey: string } | null | undefined;

function resolveVapidKeys() {
  if (resolvedKeys !== undefined) return resolvedKeys;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (publicKey && privateKey) {
    resolvedKeys = { publicKey, privateKey };
    return resolvedKeys;
  }

  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!sessionSecret) {
    resolvedKeys = null;
    return resolvedKeys;
  }

  // A stable, domain-separated P-256 key keeps Web Push usable without
  // persisting another private secret. Only the derived public key is exposed.
  const privateBytes = createHash("sha256")
    .update(`notecode:web-push:v1:${sessionSecret}`)
    .digest();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateBytes);
  resolvedKeys = {
    privateKey: privateBytes.toString("base64url"),
    publicKey: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
  };
  return resolvedKeys;
}

function configureWebPush() {
  if (configured) return true;

  const keys = resolveVapidKeys();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@purocode.com";
  if (!keys) return false;

  webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  configured = true;
  return true;
}

export function getPushConfiguration() {
  const keys = resolveVapidKeys();
  return { configured: Boolean(keys), publicKey: keys?.publicKey ?? "" };
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!configureWebPush()) return { configured: false, sent: 0, removed: 0 };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  let sent = 0;
  let removed = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          ...payload,
          icon: "/icons/icon-192.png",
          badge: "/icons/favicon-64.png",
        }),
        { TTL: 60 * 60, urgency: payload.severity === "critical" ? "high" : "normal" },
      );
      sent += 1;
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if ([404, 410].includes(statusCode)) {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } });
        removed += 1;
        return;
      }
      console.error("[push:send]", statusCode || error);
    }
  }));

  return { configured: true, sent, removed };
}

export async function sendPushToAll(payload: PushPayload) {
  const users = await prisma.pushSubscription.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });
  const results = await Promise.all(users.map(({ userId }) => sendPushToUser(userId, payload)));
  return results.reduce(
    (summary, result) => ({
      configured: summary.configured || result.configured,
      sent: summary.sent + result.sent,
      removed: summary.removed + result.removed,
    }),
    { configured: false, sent: 0, removed: 0 },
  );
}
