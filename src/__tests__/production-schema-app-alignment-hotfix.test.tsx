import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createChangeOrderWithClient, getChangeOrdersByProject } from "@/lib/change-orders-db";

function productionSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : productionSourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Production schema/app alignment hotfix", () => {
  it("queries project_change_orders with total authority and never requests amount", async () => {
    const selections: string[] = [];
    const result = {
      data: [
        {
          id: "co-1",
          project_id: "project-1",
          number: "CO-0001",
          status: "Approved",
          total: 125.25,
          total_amount: 125.25,
          approved_at: null,
        },
      ],
      error: null,
    };
    const query = {
      select(columns: string) {
        selections.push(columns);
        return query;
      },
      eq() {
        return query;
      },
      order() {
        return query;
      },
      then(resolve: (value: typeof result) => unknown) {
        return Promise.resolve(result).then(resolve);
      },
    };
    const supabase = {
      from(table: string) {
        expect(table).toBe("project_change_orders");
        return query;
      },
    } as unknown as SupabaseClient;

    const rows = await getChangeOrdersByProject("project-1", supabase);

    expect(selections).toHaveLength(1);
    expect(selections[0].split(",")).not.toContain("amount");
    expect(rows[0]).toMatchObject({ total: 125.25, amount: 125.25 });
  });

  it("creates change orders through total columns without emitting an amount field", async () => {
    let insertPayload: Record<string, unknown> | null = null;
    let selectedColumns = "";
    const insertQuery = {
      select(columns: string) {
        selectedColumns = columns;
        return insertQuery;
      },
      async single() {
        return {
          data: {
            id: "co-created",
            ...(insertPayload ?? {}),
            approved_at: null,
          },
          error: null,
        };
      },
    };
    const supabase = {
      async rpc(name: string) {
        expect(name).toBe("next_change_order_number");
        return { data: "CO-0002", error: null };
      },
      from(table: string) {
        expect(table).toBe("project_change_orders");
        return {
          insert(payload: Record<string, unknown>) {
            insertPayload = payload;
            return insertQuery;
          },
        };
      },
    } as unknown as SupabaseClient;

    const created = await createChangeOrderWithClient(supabase, "project-1", { amount: 88.45 });

    expect(insertPayload).toMatchObject({ total: 88.45, total_amount: 88.45 });
    expect(insertPayload).not.toHaveProperty("amount");
    expect(selectedColumns.split(",")).not.toContain("amount");
    expect(created).toMatchObject({ total: 88.45, amount: 88.45 });
  });

  it("passes the authenticated request client to both Workforce preload queries", () => {
    const source = readFileSync(join(process.cwd(), "src/app/labor/advances/page.tsx"), "utf8");

    expect(source).toContain("getLaborWorkersList(projectSupabase)");
    expect(source).toContain("getLaborWorkers(projectSupabase)");
    expect(source).toContain("getProjects(projectSupabase)");
  });

  it("passes the authenticated project client through the Project Profit worker-rate query", () => {
    const page = readFileSync(join(process.cwd(), "src/app/projects/[id]/profit/page.tsx"), "utf8");
    const facade = readFileSync(join(process.cwd(), "src/lib/data/index.ts"), "utf8");

    expect(page).toContain("getWorkers(projectSupabase)");
    expect(facade).toMatch(
      /export async function getWorkers\(\s*explicitClient\?: SupabaseClient\s*\)[\s\S]*?laborDb\.getWorkers\(explicitClient\)/
    );
  });

  it("contains no production callsite or schema probe for the retired payment_methods table", () => {
    const sourceRoot = join(process.cwd(), "src");
    const offenders = productionSourceFiles(sourceRoot)
      .filter((path) => /\bpayment_methods\b/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(process.cwd().length + 1));
    const bankClient = readFileSync(
      join(process.cwd(), "src/app/financial/bank/bank-client.tsx"),
      "utf8"
    );
    const bankRoute = readFileSync(
      join(process.cwd(), "src/app/api/financial/bank-transactions/route.ts"),
      "utf8"
    );

    expect(offenders).toEqual([]);
    expect(bankClient).toContain('fetch("/api/settings/expense-options"');
    expect(bankClient).toContain('type: "payment_method"');
    expect(bankRoute).toContain('.from("expense_options")');
    expect(bankRoute).toContain('.eq("type", "payment_method")');
  });
});
