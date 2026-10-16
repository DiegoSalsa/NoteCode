import { test, expect, type BrowserContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function signedOwner(context: BrowserContext) {
  const userId = randomUUID(),
    email = `${userId}@example.invalid`;
  await db.userProfile.create({
    data: { userId, email, displayName: "Security test", role: "ADMIN" },
  });
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      expiresAt: Date.now() + 3600000,
      nonce: randomUUID(),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payload)
    .digest("hex");
  await context.addCookies([
    {
      name: "notecode_session",
      value: `${payload}.${signature}`,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return { userId, email };
}
test.afterAll(() => db.$disconnect());

test("authentication, CSRF, document bytes, image optimization, SEO and Gilberto history survive patched dependencies", async ({
  page,
  context,
  browser,
}) => {
  const external = await browser.newContext({
    baseURL: "http://localhost:3217",
  });
  for (const url of [
    "/api/projects",
    "/api/documents",
    "/api/seo/overview",
    "/api/gilberto/history",
  ]) {
    expect((await external.request.get(url)).status()).toBe(401);
  }
  await external.addCookies([
    {
      name: "notecode_session",
      value: "forged.invalid",
      domain: "localhost",
      path: "/",
    },
  ]);
  expect((await external.request.get("/api/projects")).status()).toBe(401);
  const expired = Buffer.from(
    JSON.stringify({ userId: randomUUID(), expiresAt: Date.now() - 1000 }),
  ).toString("base64url");
  const expiredSignature = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(expired)
    .digest("hex");
  await external.addCookies([
    {
      name: "notecode_session",
      value: `${expired}.${expiredSignature}`,
      domain: "localhost",
      path: "/",
    },
  ]);
  expect(
    (
      await external.request.get("/api/projects", {
        headers: {
          "x-middleware-subrequest":
            "middleware:middleware:middleware:middleware:middleware",
        },
      })
    ).status(),
  ).toBe(401);
  await signedOwner(context);
  expect(
    (
      await context.request.post("/api/projects", {
        headers: { origin: "https://attacker.invalid" },
        data: { name: "Must not create" },
      })
    ).status(),
  ).toBe(403);
  const uploadBytes = Buffer.from(
    `%PDF-1.4\n% offline regression ${randomUUID()}\n%%EOF`,
  );
  const uploaded = await context.request.post("/api/documents", {
    multipart: {
      file: {
        name: "security-regression.pdf",
        mimeType: "application/pdf",
        buffer: uploadBytes,
      },
    },
  });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  const document = await uploaded.json();
  const download = await context.request.get(`/api/documents/${document.id}`);
  expect(download.ok(), await download.text()).toBe(true);
  expect(await download.body()).toEqual(uploadBytes);
  expect(
    (await external.request.get(`/api/documents/${document.id}`)).status(),
  ).toBe(401);
  const rejected = await context.request.post("/api/documents", {
    multipart: {
      file: {
        name: "script.html",
        mimeType: "text/html",
        buffer: Buffer.from("<script>alert(1)</script>"),
      },
    },
  });
  expect(rejected.status()).toBe(415);
  const image = await context.request.get(
    "/_next/image?url=%2Ficons%2Ficon-192.png&w=128&q=75",
  );
  expect(image.ok(), await image.text()).toBe(true);
  expect(image.headers()["content-type"]).toMatch(/^image\//);
  const remoteImage = await context.request.get(
    "/_next/image?url=https%3A%2F%2Fattacker.invalid%2Fimage.svg&w=128&q=75",
  );
  expect(remoteImage.status()).toBe(400);
  const seo = await context.request.get("/api/seo/overview");
  expect(seo.ok(), await seo.text()).toBe(true);
  const history = await (
    await context.request.get("/api/gilberto/history")
  ).json();
  const text = `Prueba local ${randomUUID()}`;
  const saved = await context.request.put("/api/gilberto/history", {
    data: {
      threadId: history.threadId,
      messages: [
        { id: "offline-user", role: "user", parts: [{ type: "text", text }] },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.goto("/gilberto");
  await expect(
    page.locator("span").filter({ hasText: text }).first(),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Escribele a Gilberto...")).toBeEnabled();
  expect(
    (
      await external.request.get(
        `/api/gilberto/history?threadId=${history.threadId}`,
      )
    ).status(),
  ).toBe(401);
  await signedOwner(external);
  expect(
    (
      await external.request.get(
        `/api/gilberto/history?threadId=${history.threadId}`,
      )
    ).status(),
  ).toBe(404);
  await external.close();
});

test("WebAuthn registration and subsequent real signed login work with a virtual authenticator", async ({
  page,
  context,
}) => {
  const owner = await signedOwner(context);
  await page.goto("/proyectos");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const registrationResponse = await context.request.post(
    "/api/webauthn/register/options",
  );
  expect(registrationResponse.ok(), await registrationResponse.text()).toBe(
    true,
  );
  const registration = await page.evaluate(
    async (options) => {
      const bytes = (v: string) =>
        Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        );
      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: bytes(options.challenge),
          user: { ...options.user, id: bytes(options.user.id) },
          excludeCredentials: [],
        },
      });
      return (
        credential as PublicKeyCredential & { toJSON(): unknown }
      ).toJSON();
    },
    await registrationResponse.json(),
  );
  const registered = await context.request.post(
    "/api/webauthn/register/verify",
    { data: registration },
  );
  expect(registered.ok(), await registered.text()).toBe(true);
  expect(await db.passkey.count({ where: { userId: owner.userId } })).toBe(1);
  await context.clearCookies();
  expect((await context.request.get("/api/projects")).status()).toBe(401);
  const loginOptions = await context.request.post(
    "/api/webauthn/login/options",
    { data: { email: owner.email } },
  );
  expect(loginOptions.ok(), await loginOptions.text()).toBe(true);
  const authentication = await page.evaluate(
    async (options) => {
      const bytes = (v: string) =>
        Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        );
      const credential = await navigator.credentials.get({
        publicKey: {
          ...options,
          challenge: bytes(options.challenge),
          allowCredentials: options.allowCredentials.map(
            (c: { id: string; type: string }) => ({ ...c, id: bytes(c.id) }),
          ),
        },
      });
      return (
        credential as PublicKeyCredential & { toJSON(): unknown }
      ).toJSON();
    },
    await loginOptions.json(),
  );
  const loggedIn = await context.request.post("/api/webauthn/login/verify", {
    data: authentication,
  });
  expect(loggedIn.ok(), await loggedIn.text()).toBe(true);
  expect((await context.request.get("/api/projects")).status()).toBe(200);
  const replay = await context.request.post("/api/webauthn/login/verify", {
    data: authentication,
  });
  expect(replay.status()).toBe(400);
});
