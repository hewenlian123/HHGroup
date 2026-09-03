import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getExpenses } from "@/lib/expenses-db";

type QueryError = { message?: string } | null;
type QueryResult = { data: Array<Record<string, unknown>> | null; error: QueryError };
type QueryFilter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] };

type ExecutedQuery = {
  table: string;
  columns: string;
  filters: QueryFilter[];
};

function createListSupabase(params: {
  rows: Record<string, Array<Record<string, unknown>>>;
  errors?: Record<string, Exclude<QueryError, null>>;
}) {
  const queries: ExecutedQuery[] = [];

  const supabase = {
    from(table: string) {
      let columns = "";
      const filters: QueryFilter[] = [];
      const builder: Record<string, unknown> = {};

      builder.select = (nextColumns: string) => {
        columns = nextColumns;
        return builder;
      };
      builder.eq = (column: string, value: unknown) => {
        filters.push({ kind: "eq", column, value });
        return builder;
      };
      builder.in = (column: string, values: unknown[]) => {
        filters.push({ kind: "in", column, values: [...values] });
        return builder;
      };
      builder.order = () => builder;

      const execute = async (): Promise<QueryResult> => {
        queries.push({
          table,
          columns,
          filters: filters.map((filter) =>
            filter.kind === "in" ? { ...filter, values: [...filter.values] } : { ...filter }
          ),
        });
        const error = params.errors?.[table] ?? null;
        if (error) return { data: null, error };

        const data = (params.rows[table] ?? []).filter((row) =>
          filters.every((filter) => {
            if (filter.kind === "eq") return row[filter.column] === filter.value;
            return filter.values.includes(row[filter.column]);
          })
        );
        return { data, error: null };
      };

      builder.then = (
        resolve: (value: QueryResult) => unknown,
        reject: (reason: unknown) => unknown
      ) => execute().then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient;

  return { supabase, queries };
}

function expenseHeader(id: string): Record<string, unknown> {
  return {
    id,
    expense_date: "2026-09-01",
    created_at: "2026-09-01T12:00:00.000Z",
    vendor: `Vendor ${id}`,
    vendor_name: `Vendor ${id}`,
    payment_method: "Card",
    reference_no: null,
    notes: null,
    total: 10,
    line_count: id === "expense-001" ? 1 : 0,
    receipt_url: null,
    status: "pending",
    worker_id: null,
    card_name: null,
    account_id: null,
    payment_account_id: null,
    project_id: null,
    source_type: "company",
  };
}

function attachmentInValues(query: ExecutedQuery): unknown[] {
  return query.filters.find((filter) => filter.kind === "in")?.values ?? [];
}

describe("getExpenses attachment list hydration", () => {
  it("groups and dedupes attachments with two table reads per bounded ID chunk", async () => {
    // This catches a regression back to two attachment queries per expense, cross-expense
    // attachment mixing, missing second-chunk rows, or removal of storage-key dedupe.
    const headers = Array.from({ length: 121 }, (_, index) =>
      expenseHeader(`expense-${String(index + 1).padStart(3, "0")}`)
    );
    const { supabase, queries } = createListSupabase({
      rows: {
        expenses: headers,
        expense_lines: [
          {
            id: "line-001",
            expense_id: "expense-001",
            project_id: "project-001",
            category: "Materials",
            description: "Lumber",
            amount: 10,
          },
        ],
        bank_transactions: [],
        subcontract_deductions: [],
        attachments: [
          {
            id: "legacy-001",
            entity_type: "expense",
            entity_id: "expense-001",
            file_name: "Receipt A.jpg",
            mime_type: "image/jpeg",
            size_bytes: 120,
            file_path: "quick-expense/shared.jpg",
            created_at: "2026-09-01T12:01:00.000Z",
          },
          {
            id: "legacy-002",
            entity_type: "expense",
            entity_id: "expense-002",
            file_name: "Receipt B.png",
            mime_type: "image/png",
            size_bytes: 240,
            file_path: "quick-expense/second.png",
            created_at: "2026-09-01T12:03:00.000Z",
          },
        ],
        expense_attachments: [
          {
            id: "dedicated-duplicate-001",
            expense_id: "expense-001",
            file_url: "quick-expense/shared.jpg",
            file_type: "image",
            created_at: "2026-09-01T12:00:00.000Z",
          },
          {
            id: "dedicated-pdf-001",
            expense_id: "expense-001",
            file_url: "quick-expense/other.pdf",
            file_type: "pdf",
            created_at: "2026-09-01T12:02:00.000Z",
          },
          {
            id: "dedicated-121",
            expense_id: "expense-121",
            file_url: "quick-expense/last.jpg",
            file_type: "image",
            created_at: "2026-09-01T12:04:00.000Z",
          },
        ],
      },
    });

    const expenses = await getExpenses(undefined, supabase, { includeLinkedBankTx: false });
    const byId = new Map(expenses.map((expense) => [expense.id, expense]));

    expect(byId.get("expense-001")).toEqual({
      id: "expense-001",
      date: "2026-09-01",
      vendorName: "Vendor expense-001",
      paymentMethod: "Card",
      referenceNo: undefined,
      notes: undefined,
      attachments: [
        {
          id: "legacy-001",
          fileName: "Receipt A.jpg",
          mimeType: "image/jpeg",
          size: 120,
          url: "quick-expense/shared.jpg",
          createdAt: "2026-09-01T12:01:00.000Z",
        },
        {
          id: "dedicated-pdf-001",
          fileName: "attachment.pdf",
          mimeType: "application/pdf",
          size: 0,
          url: "quick-expense/other.pdf",
          createdAt: "2026-09-01T12:02:00.000Z",
        },
      ],
      lines: [
        {
          id: "line-001",
          projectId: "project-001",
          category: "Materials",
          costCode: undefined,
          memo: "Lumber",
          amount: 10,
        },
      ],
      linkedBankTxId: undefined,
      receiptUrl: undefined,
      status: "pending",
      workerId: undefined,
      cardName: undefined,
      accountId: undefined,
      paymentAccountId: undefined,
      paymentAccountName: null,
      headerProjectId: undefined,
      headerTotal: 10,
      sourceType: "company",
      subcontractDeduction: null,
    });
    expect(byId.get("expense-002")?.attachments).toEqual([
      {
        id: "legacy-002",
        fileName: "Receipt B.png",
        mimeType: "image/png",
        size: 240,
        url: "quick-expense/second.png",
        createdAt: "2026-09-01T12:03:00.000Z",
      },
    ]);
    expect(byId.get("expense-003")?.attachments).toEqual([]);
    expect(byId.get("expense-121")?.attachments).toEqual([
      {
        id: "dedicated-121",
        fileName: "attachment.jpg",
        mimeType: "image/jpeg",
        size: 0,
        url: "quick-expense/last.jpg",
        createdAt: "2026-09-01T12:04:00.000Z",
      },
    ]);

    const attachmentQueries = queries.filter(
      (query) => query.table === "attachments" || query.table === "expense_attachments"
    );
    expect(attachmentQueries).toHaveLength(4);
    expect(attachmentQueries.filter((query) => query.table === "attachments")).toHaveLength(2);
    expect(attachmentQueries.filter((query) => query.table === "expense_attachments")).toHaveLength(
      2
    );
    expect(attachmentQueries.every((query) => attachmentInValues(query).length <= 120)).toBe(true);
    expect(
      attachmentQueries.every((query) =>
        query.filters.some(
          (filter) =>
            filter.kind === "in" &&
            (filter.column === "entity_id" || filter.column === "expense_id")
        )
      )
    ).toBe(true);
  });

  it("keeps attachment table read errors as empty list fallbacks", async () => {
    // This catches accidentally turning the existing optional attachment reads into a list failure.
    const { supabase } = createListSupabase({
      rows: {
        expenses: [expenseHeader("expense-001"), expenseHeader("expense-002")],
        expense_lines: [],
        bank_transactions: [],
        subcontract_deductions: [],
        attachments: [],
        expense_attachments: [],
      },
      errors: {
        attachments: { message: "relation public.attachments does not exist" },
        expense_attachments: {
          message: "Could not find the table 'public.expense_attachments' in the schema cache",
        },
      },
    });

    const expenses = await getExpenses(undefined, supabase, { includeLinkedBankTx: false });

    expect(expenses.map((expense) => expense.attachments)).toEqual([[], []]);
  });
});
