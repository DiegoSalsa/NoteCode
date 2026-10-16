import { describe, expect, it } from "vitest";
import { billingByOrigin, invoiceOrigin } from "./invoice-origin";
import { projectEconomics } from "./economics";
import { projectPriceView } from "./price-view";

describe("commercial correction read models", () => {
  it.each([
    [{ contractId: "c" }, "CONTRACT"],
    [{ externalReference: "contract:c:2026-10-01" }, "CONTRACT"],
    [
      { number: "REC-202610-ABC", notes: "Facturación recurrente: Soporte" },
      "CONTRACT",
    ],
    [{ number: "REC-manual", notes: "Otro servicio" }, "UNATTRIBUTED"],
    [{ agreementId: "a" }, "DEVELOPMENT"],
    [{ source: "PROJECT" }, "DEVELOPMENT"],
    [{}, "UNATTRIBUTED"],
  ] as const)("classifies %j as %s", (invoice, expected) =>
    expect(invoiceOrigin(invoice)).toBe(expected),
  );

  it("separates maintenance, unknown origins and currencies, including legacy paid markers", () => {
    const invoices = [
      {
        amount: 226100,
        currency: "CLP",
        agreementId: "a",
        status: "Parcial",
        payments: [{ amount: 100000 }],
      },
      {
        amount: 226100,
        currency: "CLP",
        agreementId: "a",
        status: "Pendiente",
        payments: [],
      },
      {
        amount: 70000,
        currency: "CLP",
        contractId: "c",
        status: "Pagado",
        payments: [],
      },
      {
        amount: 10,
        currency: "USD",
        contractId: "c",
        status: "Pendiente",
        payments: [],
      },
      { amount: 500, currency: "CLP", status: "Cancelado", payments: [] },
      { amount: 1000, currency: "CLP", status: "Pendiente", payments: [] },
    ];
    expect(billingByOrigin(invoices).CLP).toEqual({
      DEVELOPMENT: { invoiced: 452200, collected: 100000, outstanding: 352200 },
      CONTRACT: { invoiced: 70000, collected: 70000, outstanding: 0 },
      UNATTRIBUTED: { invoiced: 1000, collected: 0, outstanding: 1000 },
    });
    expect(billingByOrigin(invoices).USD.CONTRACT.invoiced).toBe(10);
    expect(
      projectEconomics({
        invoices,
        acceptedNet: 380000,
        currency: "CLP",
        budgetCost: 0,
        budgetHours: 0,
        expenses: [],
        timeEntries: [],
      }),
    ).toMatchObject({
      invoiced: 453200,
      collected: 100000,
      outstanding: 353200,
      margin: 380000,
    });
  });

  it("shows the initial explicit proposal with the same VAT rounding as the quote", () => {
    expect(
      projectPriceView({
        agreedAmount: 0,
        saleNetAmount: "380000",
        saleTaxRate: "19",
        currency: "CLP",
      }),
    ).toMatchObject({
      state: "PROPOSED",
      net: 380000,
      tax: 72200,
      total: 452200,
    });
    expect(
      projectPriceView({ saleNetAmount: 0, saleTaxRate: 19 }),
    ).toMatchObject({ state: "PROPOSED", total: 0 });
    expect(
      projectPriceView({
        saleNetAmount: 100.05,
        saleTaxRate: 19,
        currency: "USD",
      }),
    ).toMatchObject({ net: 100.05, tax: 19.01, total: 119.06 });
  });
  it("shows the accepted snapshot ahead of the initial proposal", () => {
    expect(
      projectPriceView({
        saleNetAmount: 380000,
        saleTaxRate: 19,
        currentAgreement: {
          currency: "CLP",
          netAmount: "400000",
          taxAmount: "76000",
          totalAmount: "476000",
        },
      }),
    ).toEqual({
      state: "ACCEPTED",
      label: "Acuerdo aceptado",
      currency: "CLP",
      net: 400000,
      tax: 76000,
      total: 476000,
    });
  });
  it("does not invent net or VAT for an unreviewed historical amount", () => {
    expect(projectPriceView({ agreedAmount: 380000 })).toMatchObject({
      state: "UNCONFIRMED",
      net: null,
      tax: null,
      total: 380000,
    });
    expect(projectPriceView({ agreedAmount: 0 })).toMatchObject({
      state: "UNCONFIRMED",
      total: null,
    });
  });
});
