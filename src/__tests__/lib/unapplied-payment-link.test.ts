import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInvoiceByIdWithDerived, getInvoicePaymentsForReceiptIds } from "@/lib/invoices-db";
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
  function linkClient(
    rpc: (
      name: string,
      args: Record<string, string>
    ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>
  ) {
    return {
      from() {
        throw new Error("The link must not write tables from the client.");
      },
      rpc,
    } as unknown as SupabaseClient;
  }

  it("returns paid and balance only when the atomic link posts an allocation", async () => {
    const client = linkClient(async (name, args) => {
      expect(name).toBe("link_unapplied_payment_to_invoice");
      expect(args).toEqual({ p_payment_id: "pay-25", p_invoice_id: "inv-1" });
      return {
        data: {
          payment_id: "pay-25",
          invoice_id: "inv-1",
          project_id: "project-1",
          invoice_payment_id: "alloc-25",
          paid_total: 65,
          balance_due: 35,
          already_applied: false,
        },
        error: null,
      };
    });

    await expect(linkUnappliedPaymentToInvoice("pay-25", "inv-1", client)).resolves.toEqual({
      paymentId: "pay-25",
      invoiceId: "inv-1",
      projectId: "project-1",
      paidTotal: 65,
      balanceDue: 35,
      alreadyApplied: false,
    });
  });

  it("fails when a voided allocation is not reactivated into a posted row", async () => {
    const client = linkClient(async () => ({
      data: {
        payment_id: "pay-25",
        invoice_id: "inv-1",
        project_id: "project-1",
        paid_total: 40,
        balance_due: 60,
        already_applied: false,
      },
      error: null,
    }));

    await expect(linkUnappliedPaymentToInvoice("pay-25", "inv-1", client)).rejects.toThrow(
      "Payment link did not post an allocation."
    );
  });

  it("does not treat a duplicate allocation error as a successful link", async () => {
    const client = linkClient(async () => ({
      data: null,
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    }));

    await expect(linkUnappliedPaymentToInvoice("pay-25", "inv-1", client)).rejects.toThrow(
      "duplicate key value violates unique constraint"
    );
  });
});

describe("getInvoicePaymentsForReceiptIds", () => {
  it("queries only the receipt ids on the page and keeps voided rows", async () => {
    const queried: string[][] = [];
    const client = {
      from(table: string) {
        expect(table).toBe("invoice_payments");
        return {
          select: () => ({
            in: (_column: string, ids: string[]) => {
              queried.push(ids);
              return Promise.resolve({
                data: ids.map((id) => ({
                  id: `alloc-${id}`,
                  invoice_id: "inv",
                  amount: 1,
                  paid_at: "2026-09-01",
                  payment_date: "2026-09-01",
                  method: "Check",
                  memo: null,
                  status: id === "voided-pay" ? "Voided" : "Posted",
                  payment_received_id: id,
                })),
                error: null,
              });
            },
          }),
        };
      },
    } as unknown as SupabaseClient;
    const ids = [...Array.from({ length: 101 }, (_, index) => `pay-${index}`), "voided-pay"];

    const rows = await getInvoicePaymentsForReceiptIds(ids, client);

    expect(queried).toHaveLength(2);
    expect(queried[0]).toHaveLength(100);
    expect(queried[1]).toEqual(["pay-100", "voided-pay"]);
    expect(rows).toHaveLength(102);
    expect(
      rows.some((row) => row.status === "Voided" && row.paymentReceivedId === "voided-pay")
    ).toBe(true);
  });

  it("fails closed when the page allocation query errors", async () => {
    const client = {
      from() {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: null, error: { message: "permission denied" } }),
          }),
        };
      },
    } as unknown as SupabaseClient;

    await expect(getInvoicePaymentsForReceiptIds(["pay-1"], client)).rejects.toThrow(
      /permission denied|unavailable/i
    );
  });
});
