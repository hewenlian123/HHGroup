import { expect, test } from "@playwright/test";

import {
  buildSystemFinancialReconciliationReport,
  type SystemFinancialReconciliationReadClient,
} from "@/lib/system-financial-reconciliation";

type MockResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message?: string; code?: string } | null;
};

type MockTable = {
  rows?: Array<Record<string, unknown>>;
  error?: { message?: string; code?: string };
};

function mockClient(tables: Record<string, MockTable>): SystemFinancialReconciliationReadClient {
  return {
    from(table: string) {
      return {
        select() {
          const result: MockResult = {
            data: tables[table]?.rows ?? [],
            error: tables[table]?.error ?? null,
          };
          const builder = {
            limit() {
              return Promise.resolve(result);
            },
          };
          return builder;
        },
      };
    },
  } as unknown as SystemFinancialReconciliationReadClient;
}

test.describe("System financial reconciliation report", () => {
  test("reports mismatches with full counts, truncates section issues, and disables autofix", async () => {
    const client = mockClient({
      invoices: {
        rows: [
          {
            id: "invoice-1",
            invoice_no: "INV-1",
            project_id: "project-1",
            status: "Sent",
            subtotal: 100,
            tax_amount: 5,
            total: 106.02,
            paid_total: 0,
            balance_due: 106.02,
          },
          {
            id: "invoice-2",
            invoice_no: "INV-2",
            project_id: "project-1",
            status: "Sent",
            subtotal: 50,
            tax_amount: 0,
            total: 50,
            paid_total: 10,
            balance_due: 40,
          },
        ],
      },
      invoice_items: {
        rows: [
          { id: "item-1", invoice_id: "invoice-1", qty: 1, unit_price: 100, amount: 100 },
          { id: "item-2", invoice_id: "invoice-2", qty: 1, unit_price: 50, amount: 50 },
        ],
      },
      invoice_payments: {
        rows: [
          {
            id: "invoice-payment-1",
            invoice_id: "invoice-2",
            amount: 10,
            status: "posted",
            payment_received_id: "payment-1",
          },
          {
            id: "invoice-payment-duplicate",
            invoice_id: "invoice-2",
            amount: 10,
            status: "posted",
            payment_received_id: "payment-1",
          },
        ],
      },
      payments_received: {
        rows: [{ id: "payment-1", invoice_id: "invoice-2", amount: 10, status: "posted" }],
      },
      estimates: { rows: [] },
      estimate_items: { rows: [] },
      estimate_meta: { rows: [] },
      estimate_payment_schedule_items: { rows: [] },
      projects: { rows: [] },
      worker_reimbursements: { rows: [] },
      labor_workers: { rows: [] },
      workers: { rows: [] },
      worker_payments: { rows: [] },
      worker_advances: { rows: [] },
      labor_entries: { rows: [] },
      expenses: { rows: [] },
      expense_lines: { rows: [] },
    });

    const report = await buildSystemFinancialReconciliationReport(client, {
      generatedAt: "2026-06-02T10:00:00.000Z",
      maxIssuesPerSection: 1,
    });

    expect(report.generatedAt).toBe("2026-06-02T10:00:00.000Z");
    expect(report.status).toBe("fail");
    expect(report.summary.totalIssues).toBe(2);
    expect(report.summary.high).toBe(2);
    expect(
      report.sections.find((section) => section.id === "invoice-reconciliation")
    ).toMatchObject({
      status: "fail",
    });

    const invoiceIssues =
      report.sections.find((section) => section.id === "invoice-reconciliation")?.issues ?? [];
    expect(invoiceIssues).toHaveLength(1);
    expect(invoiceIssues[0]).toMatchObject({
      severity: "high",
      category: "invoice_reconciliation",
      table: "invoices",
      id: "invoice-1",
      autoFixAvailable: false,
    });
    expect(JSON.stringify(invoiceIssues[0].evidence)).not.toContain("postgres://");
  });

  test("treats missing optional tables as no-data and per-section read errors as error", async () => {
    const report = await buildSystemFinancialReconciliationReport(
      mockClient({
        invoices: { error: { message: "permission denied for table invoices" } },
        invoice_items: { rows: [] },
        invoice_payments: { rows: [] },
        payments_received: { rows: [] },
        estimates: { rows: [] },
        estimate_items: { rows: [] },
        estimate_meta: { rows: [] },
        estimate_payment_schedule_items: {
          error: { code: "PGRST205", message: "Could not find the table" },
        },
        projects: { rows: [] },
        worker_reimbursements: { rows: [] },
        labor_workers: { rows: [] },
        workers: { rows: [] },
        worker_payments: { rows: [] },
        worker_advances: { rows: [] },
        labor_entries: { rows: [] },
        expenses: { rows: [] },
        expense_lines: { rows: [] },
      }),
      { generatedAt: "2026-06-02T10:00:00.000Z" }
    );

    expect(report.status).toBe("error");
    expect(report.summary.critical).toBe(1);
    expect(
      report.sections.find((section) => section.id === "invoice-reconciliation")
    ).toMatchObject({
      status: "error",
    });
    expect(
      report.sections.find((section) => section.id === "estimate-reconciliation")
    ).toMatchObject({
      status: "pass",
    });
  });
});
