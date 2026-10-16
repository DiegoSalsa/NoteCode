import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function owner(context: BrowserContext) {
  const userId = `e2e-${randomUUID()}`;
  await db.userProfile.create({
    data: {
      userId,
      email: `${userId}@example.invalid`,
      displayName: "Test owner",
      role: "ADMIN",
    },
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
}
async function post(api: APIRequestContext, url: string, data: unknown) {
  const r = await api.post(url, { data });
  expect(r.ok(), `${url}: ${await r.text()}`).toBeTruthy();
  return r.json();
}
async function patch(api: APIRequestContext, url: string, data: unknown) {
  const r = await api.patch(url, { data });
  expect(r.ok(), `${url}: ${await r.text()}`).toBeTruthy();
  return r.json();
}
async function createProject(api: APIRequestContext) {
  const client = await post(api, "/api/clients", {
    name: `Empresa ${randomUUID().slice(0, 8)}`,
  });
  const project = await post(api, "/api/projects", {
    name: `Web corporativa ${randomUUID().slice(0, 8)}`,
    clientId: client.id,
    description: "Web institucional",
    projectScope: "Diseño y desarrollo web accesible",
    scope: "company",
    saleNetAmount: 380000,
    saleTaxRate: 19,
    commercialTerms: "Entrega de código y documentación",
    budgetCost: 123000,
    budgetHours: 20,
  });
  return { client, project };
}
test.afterAll(() => db.$disconnect());

test("project → prefilled proposal → changes → revised portal acceptance → deposit, balance and partial payment", async ({
  page,
  context,
  browser,
}, info) => {
  await owner(context);
  const { project } = await createProject(context.request);
  await page.goto("/proyectos");
  await page.getByPlaceholder("Buscar proyectos...").fill(project.name);
  const proposed = page.getByTestId("project-price");
  await expect(proposed).toHaveCount(1);
  await expect(proposed).toContainText(
    "Precio propuesto · pendiente de aceptación",
  );
  await expect(proposed).toContainText("Neto $380.000 · IVA $72.200");
  await expect(proposed).toContainText("Total $452.200");
  await page.screenshot({
    path: info.outputPath("project-list-proposed.png"),
    fullPage: true,
  });
  await page.goto(`/proyectos/${project.id}`);
  await expect(page.getByTestId("project-price")).toContainText(
    "Precio propuesto · pendiente de aceptación",
  );
  await expect(page.getByTestId("project-price")).toContainText(
    "Total $452.200",
  );
  await page.screenshot({
    path: info.outputPath("project-detail-proposed.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Comercial/ }).click();
  await page
    .getByRole("button", { name: "Generar propuesta", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Preparar propuesta" });
  await expect(dialog.getByLabel("Precio neto 1", { exact: true })).toHaveValue(
    "380000",
  );
  await expect(dialog.getByLabel("Alcance", { exact: true })).toHaveValue(
    "Diseño y desarrollo web accesible",
  );
  await dialog
    .getByLabel("Plan de cobros", { exact: true })
    .selectOption("DEPOSIT_BALANCE");
  await expect(dialog).toContainText("452.200");
  await dialog.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Publicar en portal" }).click();
  await expect(
    page.getByRole("button", { name: "Registrar aceptación" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generar / recuperar enlace" })
    .click();
  const preview = page.getByRole("link", { name: "Vista del cliente" });
  await expect(preview).toBeVisible();
  const portalPath = (await preview.getAttribute("href"))!.split("?")[0];
  const external = await browser.newContext({
    baseURL: "http://localhost:3217",
    viewport: page.viewportSize()!,
  });
  const clientPage = await external.newPage();
  await clientPage.goto(`http://localhost:3217${portalPath}`);
  await clientPage.getByRole("button", { name: /^Cotizaciones/ }).click();
  await expect(clientPage.locator("body")).toContainText(
    "Entrega de código y documentación",
  );
  await expect(clientPage.locator("body")).toContainText("Anticipo: $226.100");
  clientPage.once("dialog", (d) => d.accept("Agregar revisión de contenidos"));
  await clientPage
    .getByRole("button", { name: "Solicitar cambios", exact: true })
    .click();
  await expect(
    clientPage.getByText("Cambios solicitados", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Comercial/ }).click();
  await page.getByRole("button", { name: "Nueva revisión" }).click();
  await page.getByRole("button", { name: "Editar borrador" }).click();
  const revised = page.getByRole("dialog", { name: "Editar propuesta" });
  await revised
    .getByLabel("Alcance", { exact: true })
    .fill("Diseño y desarrollo web accesible con revisión de contenidos");
  await revised.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(revised).toBeHidden();
  await page.getByRole("button", { name: "Publicar en portal" }).click();
  await expect(
    page.getByRole("button", { name: "Registrar aceptación" }),
  ).toBeVisible();
  await clientPage.reload();
  await clientPage.getByRole("button", { name: /^Cotizaciones/ }).click();
  await expect(
    clientPage.getByText(/con revisión de contenidos/),
  ).toBeVisible();
  const printable = await clientPage
    .getByRole("link", { name: "Ver / imprimir" })
    .first()
    .getAttribute("href");
  const documentPage = await external.newPage();
  await documentPage.goto(`http://localhost:3217${printable}`);
  await expect(
    documentPage.getByRole("heading", { name: /Web corporativa/ }),
  ).toBeVisible();
  await expect(documentPage.getByText("Revisión 2")).toBeVisible();
  await documentPage.close();
  await clientPage
    .getByRole("button", { name: "Aprobar", exact: true })
    .click();
  await expect(
    clientPage.getByText("Aprobada", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Comercial/ }).click();
  await expect(page.getByText(/Anticipo ·/)).toContainText("226.100");
  await expect(page.getByText(/Saldo contra entrega ·/)).toContainText(
    "226.100",
  );
  await page
    .getByRole("button", { name: "Emitir cobro interno" })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Emitir cobro interno" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Emitir cobro interno" }).click();
  await expect(
    page.getByRole("button", { name: "Emitir cobro interno" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Registrar pago", exact: true })
    .first()
    .click();
  const payment = page.getByRole("dialog", { name: "Registrar pago" });
  await payment.getByLabel("Importe del pago").fill("100000");
  await payment.getByRole("button", { name: "Guardar pago" }).click();
  await expect(payment).toBeHidden();
  const summary = await (
    await context.request.get(`/api/projects/${project.id}/commercial`)
  ).json();
  expect(summary.totals).toMatchObject({
    accepted: 452200,
    invoiced: 452200,
    collected: 100000,
    outstanding: 352200,
  });
  const paidInvoice = summary.invoices.find(
    (i: { payments: unknown[] }) => i.payments.length,
  );
  const forbidden = await context.request.patch(
    `/api/invoices/${paidInvoice.id}`,
    { data: { amount: 1 } },
  );
  expect(forbidden.status()).toBe(409);
  const publicData = await (
    await external.request.get(`/api${portalPath}`)
  ).json();
  const json = JSON.stringify(publicData);
  expect(json).not.toContain("budgetCost");
  expect(json).not.toContain("123000");
  expect(publicData.invoices).toHaveLength(2);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("project-price")).toContainText(
    "Acuerdo aceptado",
  );
  await expect(page.getByTestId("project-price")).toContainText(
    "Total $452.200",
  );
  await page.screenshot({
    path: info.outputPath("project-commercial.png"),
    fullPage: true,
  });
  await clientPage.screenshot({
    path: info.outputPath("client-portal.png"),
    fullPage: true,
  });
  await page.goto("/proyectos");
  await page.getByPlaceholder("Buscar proyectos...").fill(project.name);
  await expect(page.getByTestId("project-price")).toHaveCount(1);
  await expect(page.getByTestId("project-price")).toContainText(
    "Acuerdo aceptado",
  );
  await expect(page.getByTestId("project-price")).toContainText(
    "Total $452.200",
  );
  await external.close();
});

test("CRM proposal conversion and approval retries do not duplicate projects or accepted evidence", async ({
  context,
  page,
}) => {
  await owner(context);
  const opportunity = await post(context.request, "/api/erp/opportunities", {
    name: `Oportunidad ${randomUUID().slice(0, 8)}`,
    contactName: "Prospecto",
    value: 380000,
  });
  await page.goto("/erp?tab=crm");
  const row = page
    .locator("section, article, div")
    .filter({ hasText: opportunity.name });
  const prefill = await (
    await context.request.get(
      `/api/commercial/prefill?opportunityId=${opportunity.id}`,
    )
  ).json();
  const quote = await post(context.request, "/api/erp/quotes", prefill);
  const sent = await patch(context.request, `/api/erp/quotes/${quote.id}`, {
    status: "Enviada",
    editVersion: quote.editVersion,
  });
  const accepted = await Promise.all([
    patch(context.request, `/api/erp/quotes/${quote.id}`, {
      status: "Aprobada",
      contentHash: sent.contentHash,
    }),
    patch(context.request, `/api/erp/quotes/${quote.id}`, {
      status: "Aprobada",
      contentHash: sent.contentHash,
    }),
  ]);
  const projects = await Promise.all([
    patch(context.request, `/api/erp/quotes/${quote.id}`, {
      action: "convert",
    }),
    patch(context.request, `/api/erp/quotes/${quote.id}`, {
      action: "convert",
    }),
  ]);
  expect(projects[0].project.id).toBe(projects[1].project.id);
  expect(
    await db.commercialAgreement.count({ where: { quoteId: quote.id } }),
  ).toBe(1);
  expect(await db.quoteDecision.count({ where: { quoteId: quote.id } })).toBe(
    1,
  );
  await page.goto(`/proyectos/${projects[0].project.id}`);
  await expect(page.getByRole("button", { name: /^Comercial/ })).toBeVisible();
});

test("project scoped portal denies another printable proposal and respects revocation", async ({
  context,
  browser,
}) => {
  await owner(context);
  const { client, project } = await createProject(context.request);
  const other = await post(context.request, "/api/projects", {
    name: "Otro proyecto",
    clientId: client.id,
    scope: "company",
    saleNetAmount: 380000,
    saleTaxRate: 19,
  });
  const prefill = await (
    await context.request.get(`/api/commercial/prefill?projectId=${other.id}`)
  ).json();
  const quote = await post(context.request, "/api/erp/quotes", prefill);
  await patch(context.request, `/api/erp/quotes/${quote.id}`, {
    status: "Enviada",
    editVersion: 1,
  });
  const portal = await post(
    context.request,
    `/api/projects/${project.id}/portal`,
    {},
  );
  const external = await browser.newContext({
    baseURL: "http://localhost:3217",
  });
  const api = await external.request.get(`/api${portal.portalPath}`);
  expect(api.ok()).toBe(true);
  expect((await api.json()).quotes).toHaveLength(0);
  const denied = await external.request.get(
    `/api${portal.portalPath}/quotes/${quote.id}`,
  );
  expect(denied.status()).toBe(404);
  const response = await external.request.get(
    `${portal.portalPath}/cotizaciones/${quote.id}`,
  );
  const body = await response.text();
  expect(body).not.toContain(quote.number);
  expect(body).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  await patch(context.request, `/api/erp/portal-tokens/${portal.id}`, {
    action: "revoke",
  });
  expect(
    (await external.request.get(`/api${portal.portalPath}`)).status(),
  ).toBe(404);
  await external.close();
});

test("desktop and mobile keep global workspace navigation and unrelated modules usable", async ({
  page,
  context,
}) => {
  await owner(context);
  for (const path of [
    "/proyectos",
    "/notas",
    "/documentos",
    "/erp?tab=contratos",
    "/finanzas",
    "/seo",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("main").first()).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        { message: path },
      )
      .toBe(true);
  }
});
