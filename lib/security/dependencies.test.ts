import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  convertToModelMessages,
  generateText,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { z } from "zod";
import type sharpFactory from "sharp";
import { quoteTotals } from "@/lib/commercial/money";

const require = createRequire(import.meta.url);

describe("patched dependency compatibility", () => {
  it("resolves patched Sharp through Next and decodes SVG and PNG using the native module", async () => {
    const fromNext = createRequire(require.resolve("next/package.json"));
    const sharp = fromNext("sharp") as typeof sharpFactory;
    const version = sharp.versions.sharp;
    const [major, minor, patch] = version.split(".").map(Number);
    expect(major > 0 || minor > 35 || (minor === 35 && patch >= 5)).toBe(true);
    const png = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="red"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    expect(await sharp(png).metadata()).toMatchObject({
      width: 8,
      height: 6,
      format: "png",
    });
  });

  it("loads a real Prisma 6 config using its scoped patched merger", async () => {
    const fromPrisma = createRequire(require.resolve("@prisma/config"));
    const { deepmerge } = fromPrisma("deepmerge-ts") as {
      deepmerge: (...items: object[]) => object;
    };
    const left: { self?: object } = {},
      right: { self?: object } = {};
    left.self = left;
    right.self = right;
    expect(() => deepmerge(left, right)).not.toThrow(RangeError);
    expect(
      deepmerge(
        { migrations: { path: "migrations" } },
        { schema: "schema.prisma" },
      ),
    ).toEqual({ migrations: { path: "migrations" }, schema: "schema.prisma" });
    const { loadConfigFromFile } =
      require("@prisma/config") as typeof import("@prisma/config");
    const dir = await mkdtemp(path.join(tmpdir(), "notecode-prisma-config-"));
    const target = path.resolve(dir);
    if (
      path.dirname(target) !== path.resolve(tmpdir()) ||
      !path.basename(target).startsWith("notecode-prisma-config-")
    )
      throw new Error("Unexpected cleanup target");
    try {
      await writeFile(
        path.join(dir, "prisma.config.js"),
        'module.exports = { schema: "schema.prisma", migrations: { path: "migrations" } };',
      );
      const loaded = await loadConfigFromFile({ configRoot: dir });
      expect(loaded.error).toBeUndefined();
      expect(loaded.config?.schema).toBe(path.join(dir, "schema.prisma"));
      expect(loaded.config?.migrations?.path).toBe(
        path.join(dir, "migrations"),
      );
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it("keeps Gilberto's DeepSeek tool input, execution and subsequent response compatible", async () => {
    let calls = 0;
    const provider = createDeepSeek({
      apiKey: "synthetic-offline-test",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        calls++;
        if (calls === 2)
          expect(
            body.messages.some((m: { role: string }) => m.role === "tool"),
          ).toBe(true);
        return Response.json({
          id: "offline",
          model: "deepseek-chat",
          created: 1,
          choices: [
            {
              index: 0,
              message:
                calls === 1
                  ? {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "price-tool",
                          type: "function",
                          function: {
                            name: "price",
                            arguments: '{"net":380000}',
                          },
                        },
                      ],
                    }
                  : { role: "assistant", content: "Total $452.200" },
              finish_reason: calls === 1 ? "tool_calls" : "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      },
    });
    const result = await generateText({
      model: provider("deepseek-chat"),
      prompt: "Calcula el precio",
      stopWhen: stepCountIs(3),
      tools: {
        price: tool({
          inputSchema: z.object({ net: z.number().nonnegative() }),
          execute: async ({ net }) =>
            quoteTotals([{ quantity: 1, unitPrice: net }]),
        }),
      },
    });
    expect(result.steps[0].toolResults[0].output).toMatchObject({
      net: 380000,
      tax: 72200,
      total: 452200,
    });
    expect(result.text).toBe("Total $452.200");
    expect(calls).toBe(2);
  });

  it("keeps the UI message streaming protocol used by Gilberto", async () => {
    const provider = createDeepSeek({
      apiKey: "synthetic-offline-test",
      fetch: async () =>
        new Response(
          [
            {
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content: "Respuesta local" },
                  finish_reason: null,
                },
              ],
            },
            { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
          ]
            .map(
              (chunk) =>
                `data: ${JSON.stringify({ id: "offline", object: "chat.completion.chunk", created: 1, model: "deepseek-chat", ...chunk })}\n\n`,
            )
            .join("") + "data: [DONE]\n\n",
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    });
    const messages = await convertToModelMessages([
      { role: "user", parts: [{ type: "text", text: "Hola" }] },
    ]);
    const result = streamText({ model: provider("deepseek-chat"), messages });
    const response = result.toUIMessageStreamResponse();
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(await response.text()).toContain('"delta":"Respuesta local"');
  });
});
