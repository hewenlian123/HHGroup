import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInvoiceByIdWithDerived } from "@/lib/invoices-db";
import { paymentLinkDecision, unappliedCustomerReceipts } from "@/lib/payment-allocation";
import { linkUnappliedPaymentToInvoice } from "@/lib/payments-received-db";

const invoiceId = "44444444-4444-4444-4444-444444444447";

function scriptedClient(responses: Record<string, Array<{ data: unknown; error: null }>>) {
  const queues = Object.fromEntries(
    Object.entries(responses).map(([table, results]) => [table, [...results]])
  ) as Record<string, Array<{ data: unknown; error: null }>>;
  return {
    from(table: string) {
      const next = () => Promise.resolve(queues[table]?.shift() ?? { data: [], error: null });
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "range"]) {
        builder[method] = () => builder;
      }
      builder.maybeSingle = next;
      builder.then = (
        resolve: (value: { data: unknown; error: null }) => unknown,
        reject: (reason: unknown) => unknown
      ) => next().then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("unapplied customer receipts", () => {
  it("keeps an unallocated receipt out of invoice paid until an allocation exists", async () => {
    const client = scriptedClient({
      invoices: [
        {
          data: {
            id: invoiceId,
            invoice_no: "[E2E]-INV-SEED-001",
            project_id: "project-1",
            customer_id: "customer-1",
            client_name: "[E2E] Test Customer",
            status: "Sent",
            total: 100,
            subtotal: 100,
            tax_pct: 0,
            tax_amount: 0,
            issue_date: "2026-09-01",
            due_date: "2999-09-30",
            notes: null,
            created_at: "2026-09-01T00:00:00.000Z",
          },
          error: null,
        },
      ],
      invoice_items: [{ data: [], error: null }],
      invoice_payments: [
        {
          data: [
            {
              id: "alloc-40",
              invoice_id: invoiceId,
              amount: 40,
              payment_date: "2026-09-02",
              paid_at: "2026-09-02",
              method: "ACH",
              memo: "Applied",
              status: "Posted",
              payment_received_id: "pay-40",
            },
          ],
          error: null,
        },
      ],
      payments_received: [
        {
          data: [
            {
              id: "pay-25",
              invoice_id: invoiceId,
              amount: 25,
              payment_date: "2026-09-03",
              status: "completed",
            },
          ],
          error: null,
        },
      ],
    });

    const invoice = await getInvoiceByIdWithDerived(invoiceId, client);
    expect(invoice?.paidTotal).toBe(40);
    expect(invoice?.balanceDue).toBe(60);
    expect(invoice?.computedStatus).toBe("Partial");
  });

  it("treats a receipt as unapplied until its allocation is posted", () => {
    const receipt = { id: "pay-25", status: "completed" };
    expect(unappliedCustomerReceipts([receipt], [])).toEqual([receipt]);
    expect(
      unappliedCustomerReceipts([receipt], [{ payment_received_id: "pay-25", status: "Posted" }])
    ).toEqual([]);
  });

  it("rejects a link that exceeds the invoice balance or leaves the project", () => {
    const receipt = {
      id: "pay-25",
      projectId: "project-1",
      customerId: "customer-1",
      customerName: "Ada",
      amount: 25,
      status: "completed",
    };
    expect(
      paymentLinkDecision({
        receipt,
        invoice: {
          id: "inv-1",
          projectId: "project-1",
          customerId: "customer-1",
          clientName: "Ada",
          status: "Sent",
          balanceDue: 20,
        },
      })
    ).toEqual({ ok: false, error: "Payment exceeds the invoice balance." });
    expect(
      paymentLinkDecision({
        receipt,
        invoice: {
          id: "inv-2",
          projectId: "project-2",
          customerId: "customer-1",
          clientName: "Ada",
          status: "Sent",
          balanceDue: 100,
        },
      })
    ).toEqual({ ok: false, error: "Choose an open invoice for the same project." });
  });
});

describe("linkUnappliedPaymentToInvoice", () => {
  it("posts an invoice allocation and returns the trigger-backed paid and balance", async () => {
    const invoice = {
      id: "inv-1",
      invoice_no: "INV-1",
      project_id: "project-1",
      customer_id: "customer-1",
      client_name: "Ada",
      status: "Sent",
      total: 100,
      paid_total: 40,
      balance_due: 60,
    };
    const payment = {
      id: "pay-25",
      invoice_id: "inv-1",
      project_id: "project-1",
      customer_id: "customer-1",
      customer_name: "Ada",
      payment_date: "2026-09-03",
      amount: 25,
      payment_method: "Check",
      notes: "SEED-25",
      deposit_account: null,
      attachment_url: null,
      status: "completed",
      created_at: "2026-09-03T00:00:00.000Z",
    };
    let inserted: Record<string, unknown> | null = null;
    const client = {
      from(table: string) {
        let operation = "select";
        let payload: Record<string, unknown> | null = null;
        const run = () => {
          if (table === "payments_received" && operation === "select") {
            return { data: payment, error: null };
          }
          if (table === "invoices" && operation === "select") {
            return { data: { ...invoice }, error: null };
          }
          if (table === "invoice_payments" && operation === "select") {
            return { data: [], error: null };
          }
          if (table === "invoice_payments" && operation === "insert") {
            inserted = payload;
            invoice.paid_total = 65;
            invoice.balance_due = 35;
            invoice.status = "Partially Paid";
            return { data: { id: "alloc-25" }, error: null };
          }
          if (table === "payments_received" && operation === "update") {
            payment.invoice_id = String(payload?.invoice_id ?? payment.invoice_id);
            return { data: { id: payment.id }, error: null };
          }
          return { data: null, error: { message: `Unexpected ${operation} on ${table}` } };
        };
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          insert: (row: Record<string, unknown>) => {
            operation = "insert";
            payload = row;
            return builder;
          },
          update: (row: Record<string, unknown>) => {
            operation = "update";
            payload = row;
            return builder;
          },
          maybeSingle: () => Promise.resolve(run()),
          then: (
            resolve: (value: { data: unknown; error: { message?: string } | null }) => unknown,
            reject?: (reason: unknown) => unknown
          ) => Promise.resolve(run()).then(resolve, reject),
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    await expect(linkUnappliedPaymentToInvoice("pay-25", "inv-1", client)).resolves.toEqual({
      paymentId: "pay-25",
      invoiceId: "inv-1",
      projectId: "project-1",
      paidTotal: 65,
      balanceDue: 35,
      alreadyApplied: false,
    });
    expect(inserted).toMatchObject({
      invoice_id: "inv-1",
      amount: 25,
      status: "Posted",
      payment_received_id: "pay-25",
      method: "Check",
      memo: "SEED-25",
    });
    expect(payment.invoice_id).toBe("inv-1");
  });
});
