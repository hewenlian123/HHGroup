import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getApPaymentsPage } from "@/lib/ap-bills-db";
import { getPaymentsReceived } from "@/lib/payments-received-db";

function fixture(deniedTable?: string, missing = false) {
  const calls: URL[] = [];
  const rows: Record<string, unknown[]> = {
    payments_received: [
      {
        id: "received-1",
        invoice_id: "invoice-1",
        project_id: "project-1",
        customer_name: "Fixture Customer",
        payment_date: "2026-09-03",
        amount: 125.25,
        payment_method: "ACH",
        status: "posted",
        created_at: "2026-09-03",
      },
    ],
    invoices: [{ id: "invoice-1", invoice_no: "INV-1" }],
    projects: [{ id: "project-1", name: "Fixture Project" }],
    payment_received_attachments: [],
    ap_bill_payments: [
      {
        id: "outgoing-1",
        bill_id: "bill-1",
        payment_date: "2026-09-03",
        amount: 125.25,
        payment_method: "Check",
        reference_no: "CHECK-41",
        created_at: "2026-09-03",
        ap_bills: {
          id: "bill-1",
          bill_no: "BILL-1",
          vendor_name: "Fixture Vendor",
          amount: 1000,
          paid_amount: 125.25,
          balance_amount: 874.75,
          status: "Partially Paid",
          projects: { name: "Fixture Project" },
        },
      },
    ],
  };
  const client = createClient("http://127.0.0.1:54321", "fixture-session-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        const table = url.pathname.split("/").at(-1)!;
        if (table === deniedTable)
          return new Response(
            JSON.stringify({
              code: missing ? "42P01" : "42501",
              message: missing ? `relation ${table} does not exist` : "permission denied",
            }),
            { status: missing ? 404 : 403, headers: { "Content-Type": "application/json" } }
          );
        return new Response(JSON.stringify(rows[table] ?? []), {
          headers: { "Content-Type": "application/json", "Content-Range": "50-50/51" },
        });
      },
    },
  });
  return { client, calls };
}

describe("Finance workspace session reads", () => {
  it("keeps received payment amount and invoice/project associations on the supplied client", async () => {
    const { client, calls } = fixture();
    const rows = await getPaymentsReceived({ includeVoided: true }, client);
    expect(rows[0]).toMatchObject({
      amount: 125.25,
      invoice_id: "invoice-1",
      invoice_no: "INV-1",
      project_name: "Fixture Project",
      payment_method: "ACH",
    });
    expect(calls.every((url) => url.origin === "http://127.0.0.1:54321")).toBe(true);
    expect(calls.some((url) => url.pathname.endsWith("ap_bill_payments"))).toBe(false);
  });
  for (const table of ["payments_received", "invoices", "projects"]) {
    it(`fails closed when received-payment ${table} is denied`, async () => {
      const { client } = fixture(table);
      await expect(getPaymentsReceived({}, client)).rejects.toThrow();
    });
  }
  it("does not turn a missing received-payment ledger into an empty balance", async () => {
    const { client } = fixture("payments_received", true);
    await expect(getPaymentsReceived({}, client)).rejects.toThrow();
  });
  it("pages outgoing AP payments without mixing cash-in or dropping the bill/reference", async () => {
    const { client, calls } = fixture();
    const result = await getApPaymentsPage(client, 2);
    expect(result).toMatchObject({ total: 51, page: 2, pageSize: 50 });
    expect(result.payments[0]).toMatchObject({
      amount: 125.25,
      reference_no: "CHECK-41",
      bill_id: "bill-1",
      bill: {
        bill_no: "BILL-1",
        vendor_name: "Fixture Vendor",
        project_name: "Fixture Project",
        balance_amount: 874.75,
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].pathname).toBe("/rest/v1/ap_bill_payments");
    expect(calls[0].searchParams.get("offset")).toBe("50");
    expect(calls[0].searchParams.get("limit")).toBe("50");
    expect(calls[0].searchParams.get("order")).toBe("payment_date.desc,id.desc");
  });
  it("fails closed on denied AP history", async () => {
    const { client } = fixture("ap_bill_payments");
    await expect(getApPaymentsPage(client)).rejects.toThrow();
  });
  it("normalizes invalid AP history page numbers", async () => {
    const { client } = fixture();
    expect((await getApPaymentsPage(client, -2)).page).toBe(1);
    expect((await getApPaymentsPage(client, Infinity)).page).toBe(1);
  });
});
