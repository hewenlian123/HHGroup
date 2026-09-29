import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdminNoStore: () => null,
}));

import { processClaimedInboxOcrJob } from "@/lib/expense-inbox-ocr-job";

const EXPENSE_ID = "expense-1";
const LINE_ID = "line-1";

type QueryState = {
  table: string;
  op: string;
  payload?: unknown;
  filters: string[];
  terminal: "maybeSingle" | "await";
};

function query(table: string, calls: QueryState[], answer: (state: QueryState) => unknown) {
  const state: QueryState = { table, op: "select", filters: [], terminal: "await" };
  const self: Record<string, unknown> = {};
  const filter = (name: string, value: unknown) => {
    state.filters.push(`${name}:${JSON.stringify(value)}`);
    return self;
  };
  self.select = () => self;
  self.update = (payload: unknown) => {
    state.op = "update";
    state.payload = payload;
    return self;
  };
  self.eq = (column: string, value: unknown) => filter(column, value);
  self.in = (column: string, value: unknown) => filter(column, value);
  self.is = (column: string, value: unknown) => filter(`is ${column}`, value);
  self.neq = () => self;
  self.gte = () => self;
  self.lte = () => self;
  self.limit = () => self;
  self.maybeSingle = async () => {
    const snapshot = { ...state, filters: [...state.filters], terminal: "maybeSingle" as const };
    calls.push(snapshot);
    return answer(snapshot);
  };
  self.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => {
    const snapshot = { ...state, filters: [...state.filters], terminal: "await" as const };
    calls.push(snapshot);
    return Promise.resolve(answer(snapshot)).then(onFulfilled, onRejected);
  };
  return self;
}

function client(stillDraft: boolean) {
  const calls: QueryState[] = [];
  let expenseReads = 0;
  const supabase = {
    from(table: string) {
      return query(table, calls, (state) => {
        if (table === "expenses" && state.terminal === "maybeSingle") {
          expenseReads += 1;
          if (expenseReads === 1) {
            return {
              data: {
                id: EXPENSE_ID,
                created_at: "2026-09-28T12:00:00Z",
                expense_date: "2026-09-28",
                vendor_name: "Unknown",
                vendor: "Unknown",
                vendor_id: null,
                status: "needs_review",
                reference_no: `INBOX-UP-${"a".repeat(64)}`,
                due_date: null,
                subtotal: null,
                tax_amount: null,
                total: 0.01,
                amount: 0.01,
                ocr_attempts: 1,
                duplicate_expense_id: null,
                duplicate_dismissed_at: null,
                file_sha256: null,
              },
              error: null,
            };
          }
          return { data: stillDraft ? { id: EXPENSE_ID } : null, error: null };
        }
        if (table === "attachments") {
          return {
            data: {
              file_path: "expense-attachments/inbox/receipt.jpg",
              file_name: "receipt.jpg",
              mime_type: "image/jpeg",
            },
            error: null,
          };
        }
        if (table === "expense_lines" && state.op === "select") {
          return { data: [{ id: LINE_ID, amount: 0.01, total: 0.01 }], error: null };
        }
        if (state.op === "update") return { data: [{ id: LINE_ID }], error: null };
        return { data: [], error: null };
      });
    },
    storage: {
      from() {
        return {
          download: async () => ({
            data: {
              type: "image/jpeg",
              arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
            },
            error: null,
          }),
        };
      },
    },
  };
  return { supabase, calls };
}

describe("inbox OCR line amount draft guard", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  vendor_name: "Honolulu Lumber",
                  invoice_number: "A-44",
                  invoice_date: "2026-09-01",
                  due_date: "2026-10-01",
                  subtotal: 100,
                  tax_amount: 4.5,
                  total_amount: 104.5,
                  confidence: { total: "high" },
                }),
              },
            },
          ],
        }),
      }))
    );
  });

  it("writes the line amount while the expense is still an inbox draft", async () => {
    const { supabase, calls } = client(true);

    const result = await processClaimedInboxOcrJob(supabase as never, EXPENSE_ID);

    const lineUpdates = calls.filter(
      (call) => call.table === "expense_lines" && call.op === "update"
    );
    expect(result).toBe("done");
    expect(lineUpdates).toHaveLength(1);
    expect(lineUpdates[0]?.payload).toEqual({ amount: 104.5, total: 104.5 });
  });

  it("skips the line amount when the expense is no longer an inbox draft", async () => {
    const { supabase, calls } = client(false);

    const result = await processClaimedInboxOcrJob(supabase as never, EXPENSE_ID);

    const lineUpdates = calls.filter(
      (call) => call.table === "expense_lines" && call.op === "update"
    );
    const headerAmountUpdates = calls.filter(
      (call) =>
        call.table === "expenses" &&
        call.op === "update" &&
        call.payload != null &&
        typeof call.payload === "object" &&
        "amount" in call.payload
    );
    expect(result).toBe("done");
    expect(lineUpdates).toHaveLength(0);
    expect(headerAmountUpdates).toHaveLength(0);
  });
});
