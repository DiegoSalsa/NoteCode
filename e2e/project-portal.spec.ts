import { test, expect, type Page, type Route } from "@playwright/test";
import { build } from "vite";
import path from "node:path";

let fixtureHtml: string;
test.beforeAll(async () => {
  // Exercise the real component and React lifecycle without adding a test route
  // or browser dependencies to the application.
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [{
      name: "portal-fixture-link",
      enforce: "pre",
      resolveId(id) { if (id === "next/link") return "\0fixture-link"; },
      load(id) {
        if (id === "\0fixture-link")
          return 'import {createElement} from "react"; export default function Link(props) { return createElement("a", props); }';
      },
    }],
    build: {
      write: false,
      lib: {
        entry: path.resolve("e2e/fixtures/project-portal.jsx"),
        formats: ["iife"],
        name: "PortalFixture",
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunk = outputs.flatMap((output) => "output" in output ? output.output : []).find((item) => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("Portal fixture did not build");
  fixtureHtml = `<meta charset="utf-8"><div id="root"></div><script>${chunk.code.replace(/<\/script/gi, "<\\/script")}</script>`;
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
async function showProject(page: Page, id: string) {
  await page.evaluate((projectId) => {
    (window as unknown as { PortalFixture: { showProject: (id: string) => void } })
      .PortalFixture.showProject(projectId);
  }, id);
}
async function openFixture(page: Page) {
  await page.route("**/portal-race-fixture", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8", body: fixtureHtml,
  }));
  await page.goto("/portal-race-fixture");
  await showProject(page, "old-project");
  await expect(page.getByText("Old portal · Activo", { exact: true })).toBeVisible();
}
function portal(label: string) {
  return [{ id: label, label, revokedAt: null, portalPath: "/portal/fixture" }];
}
async function fulfillOldRequest(route: Route, status: number) {
  // Aborted requests can no longer receive a response in some browsers.
  await route.fulfill({ status, json: status === 200 ? {} : { error: "Old action error" } }).catch(() => {});
}

for (const status of [200, 409]) {
  test(`changing project aborts a pending action (${status}) without changing the new panel`, async ({ page }) => {
    const releaseOld = deferred(), enteredOld = deferred(), releaseNew = deferred(), enteredNew = deferred();
    let oldLoads = 0;
    await page.route("**/api/projects/*/portal", async (route) => {
      const old = route.request().url().includes("/old-project/");
      if (route.request().method() === "GET") {
        if (old) oldLoads++;
        return route.fulfill({ json: portal(old ? "Old portal" : "New portal") });
      }
      (old ? enteredOld : enteredNew).resolve();
      await (old ? releaseOld : releaseNew).promise;
      if (old) await fulfillOldRequest(route, status);
      else await route.fulfill({ json: {} }).catch(() => {});
    });
    try {
      await openFixture(page);
      const button = page.getByRole("button", { name: "Generar / recuperar enlace" });
      await button.click();
      await enteredOld.promise;
      const aborted = page.waitForEvent("requestfailed", {
        predicate: (request) => request.method() === "POST" && request.url().includes("/old-project/"),
        timeout: 10_000,
      });
      await showProject(page, "new-project");
      await aborted;
      await expect(page.getByText("New portal · Activo", { exact: true })).toBeVisible();
      await expect(button).toBeEnabled();
      await button.click();
      await enteredNew.promise;
      releaseOld.resolve();
      await expect(button).toBeDisabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(oldLoads).toBe(1);
      releaseNew.resolve();
      await expect(button).toBeEnabled();
      await expect(page.getByText("Old portal · Activo", { exact: true })).toHaveCount(0);
    } finally {
      releaseOld.resolve(); releaseNew.resolve();
    }
  });
}

test("changing project aborts an action's pending reload", async ({ page }) => {
  const enteredReload = deferred(), releaseReload = deferred();
  let oldLoads = 0;
  await page.route("**/api/projects/*/portal", async (route) => {
    const old = route.request().url().includes("/old-project/");
    if (route.request().method() === "POST") return route.fulfill({ json: {} });
    if (old && ++oldLoads > 1) {
      enteredReload.resolve();
      await releaseReload.promise;
      return route.fulfill({ json: portal("Stale reload") }).catch(() => {});
    }
    return route.fulfill({ json: portal(old ? "Old portal" : "New portal") });
  });
  try {
    await openFixture(page);
    await page.getByRole("button", { name: "Generar / recuperar enlace" }).click();
    await enteredReload.promise;
    const aborted = page.waitForEvent("requestfailed", {
      predicate: (request) => request.method() === "GET" && request.url().includes("/old-project/"),
      timeout: 10_000,
    });
    await showProject(page, "new-project");
    await aborted;
    releaseReload.resolve();
    await expect(page.getByText("New portal · Activo", { exact: true })).toBeVisible();
    await expect(page.getByText("Stale reload · Activo", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Generar / recuperar enlace" })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    releaseReload.resolve();
  }
});
