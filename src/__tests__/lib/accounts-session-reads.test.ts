import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getCashOverview } from "@/lib/data";
import { getAccounts } from "@/lib/accounts-db";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), revalidate: vi.fn(), browserClient: vi.fn() }));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerActionClient: mocks.guard,
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: mocks.browserClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import {
  getAccountsAction,
  createAccountAction,
  updateAccountAction,
  deleteAccountAction,
} from "@/app/financial/accounts/actions";

function fixture(
  options: {
    empty?: boolean;
    fail?: string;
    code?: string;
    missingExpenseTotal?: boolean;
    nullBank?: boolean;
    nullExpenses?: boolean;
  } = {}
) {
  const calls: Array<{ url: URL; body: unknown; method: string }> = [];
  const client = createClient("http://127.0.0.1:54321", "fixture-session", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1)!;
        calls.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : null,
          method: init?.method ?? "GET",
        });
        const fail =
          options.fail === table || (options.missingExpenseTotal && table === "expenses");
        if (fail)
          return new Response(
            JSON.stringify({
              code:
                options.missingExpenseTotal && table === "expenses"
                  ? "42703"
                  : (options.code ?? "42501"),
              message:
                options.missingExpenseTotal && table === "expenses"
                  ? "column total does not exist"
                  : "permission denied",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        const data: Record<string, unknown> = {
          bank_transactions: options.nullBank
            ? null
            : [
                {
                  id: "bank-1",
                  txn_date: "2026-09-01",
                  amount: 500,
                  status: "reconciled",
                  description: "Fixture deposit",
                },
                {
                  id: "bank-2",
                  txn_date: "2026-09-02",
                  amount: -125.25,
                  status: "unmatched",
                  description: "Fixture withdrawal",
                },
              ],
          expenses: options.nullExpenses ? null : [{ total: 200.5 }],
          expense_lines: [{ expense_id: "expense-1", amount: 200.5 }],
          accounts: [
            { id: "account-1", name: "Fixture bank", type: "Bank", last_four: "1234", notes: null },
          ],
        };
        return new Response(
          JSON.stringify(
            options.empty
              ? []
              : table === "accounts" && init?.method === "POST"
                ? (data.accounts as unknown[])[0]
                : Object.hasOwn(data, table)
                  ? data[table]
                  : []
          ),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    },
  });
  return { client, calls };
}

beforeEach(() => vi.clearAllMocks());

describe("Accounts cash overview", () => {
  it("rejects an unavailable expense total instead of showing a valid cash difference", async () => {
    await expect(getCashOverview(fixture({ nullExpenses: true }).client)).rejects.toThrow();
  });
  it("account lookup permission errors remain unavailable during expense writes", async () => {
    const client = createClient("http://127.0.0.1:54321", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async () =>
          new Response(
            JSON.stringify({ code: "42501", message: "permission denied for table accounts" }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            }
          ),
      },
    });
    mocks.browserClient.mockReturnValue(client);
    await expect(getAccounts()).rejects.toThrow();
  });

  it("preserves the bank-minus-expenses formula using one supplied session", async () => {
    const { client, calls } = fixture();
    expect(await getCashOverview(client)).toMatchObject({
      bankBalance: 374.75,
      systemExpenses: 200.5,
      reconciledBankTotal: 500,
      unreconciledBankTotal: -125.25,
      cashDifference: 174.25,
    });
    expect(calls.map(({ url }) => url.pathname.split("/").at(-1)).sort()).toEqual([
      "bank_transactions",
      "expenses",
    ]);
  });
  it("successful empty reads yield valid zero", async () => {
    const { client } = fixture({ empty: true });
    expect(await getCashOverview(client)).toEqual({
      bankBalance: 0,
      systemExpenses: 0,
      reconciledBankTotal: 0,
      unreconciledBankTotal: 0,
      cashDifference: 0,
      recentUnreconciled: [],
      dataLoadWarnings: [],
    });
  });
  for (const fail of ["bank_transactions", "expenses"]) {
    for (const code of ["42501", "42P01"])
      it(`${fail} ${code} is unavailable, not zero`, async () => {
        const { client } = fixture({ fail, code });
        await expect(getCashOverview(client)).rejects.toThrow();
      });
  }
  it("retains the same session for the existing expense-lines compatibility read", async () => {
    const { client, calls } = fixture({ missingExpenseTotal: true });
    expect((await getCashOverview(client)).systemExpenses).toBe(200.5);
    expect(calls.some(({ url }) => url.pathname.endsWith("/expense_lines"))).toBe(true);
  });
  it("does not turn a failed compatibility read into zero", async () => {
    const { client } = fixture({ missingExpenseTotal: true, fail: "expense_lines" });
    await expect(getCashOverview(client)).rejects.toThrow();
  });
  it("does not treat a missing bank result as a successful empty ledger", async () => {
    const { client } = fixture({ nullBank: true });
    await expect(getCashOverview(client)).rejects.toThrow();
  });
});

describe("Accounts action session boundary", () => {
  it("uses the guarded session and retains current-user/shared visibility", async () => {
    const { client, calls } = fixture();
    mocks.guard.mockResolvedValue({ ok: true, client, context: { user: { id: "user-1" } } });
    expect(await getAccountsAction()).toEqual({
      accounts: [
        { id: "account-1", name: "Fixture bank", type: "Bank", lastFour: "1234", notes: null },
      ],
    });
    expect(mocks.guard).toHaveBeenCalledWith({ noStore: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.searchParams.get("or")).toBe("(user_id.eq.user-1,user_id.is.null)");
  });
  it("successful no accounts is distinct from a denied account read", async () => {
    mocks.guard.mockResolvedValue({
      ok: true,
      client: fixture({ empty: true }).client,
      context: { user: { id: "user-1" } },
    });
    expect(await getAccountsAction()).toEqual({ accounts: [] });
    mocks.guard.mockResolvedValue({
      ok: true,
      client: fixture({ fail: "accounts" }).client,
      context: { user: { id: "user-1" } },
    });
    expect(await getAccountsAction()).toMatchObject({ accounts: [], error: expect.any(String) });
  });
  it("denies all account actions before touching the database when auth fails", async () => {
    mocks.guard.mockResolvedValue({ ok: false, status: 403, error: "Owner or admin required." });
    expect(await getAccountsAction()).toMatchObject({ error: "Owner or admin required." });
    expect(await createAccountAction({ name: "Fixture", type: "Bank" })).toHaveProperty("error");
    expect(
      await updateAccountAction({ id: "account-1", name: "Fixture", type: "Bank" })
    ).toMatchObject({ ok: false });
    expect(await deleteAccountAction("account-1")).toMatchObject({ ok: false });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each(["update", "delete"])(
    "rejects a zero-row %s without reporting success",
    async (operation) => {
      mocks.guard.mockResolvedValue({
        ok: true,
        client: fixture({ empty: true }).client,
        context: { user: { id: "user-1" } },
      });
      const result =
        operation === "update"
          ? await updateAccountAction({ id: "missing-or-denied", name: "Fixture", type: "Bank" })
          : await deleteAccountAction("missing-or-denied");
      expect(result).toMatchObject({ ok: false, error: expect.any(String) });
      expect(mocks.revalidate).not.toHaveBeenCalled();
    }
  );

  it.each(["update", "delete"])("confirms a successful one-row %s", async (operation) => {
    mocks.guard.mockResolvedValue({
      ok: true,
      client: fixture().client,
      context: { user: { id: "user-1" } },
    });
    const result =
      operation === "update"
        ? await updateAccountAction({ id: "account-1", name: "Fixture", type: "Bank" })
        : await deleteAccountAction("account-1");
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidate).toHaveBeenCalledWith("/financial/accounts");
  });

  it("creates through the same session with verified ownership, without a second auth read", async () => {
    const { client, calls } = fixture();
    mocks.guard.mockResolvedValue({ ok: true, client, context: { user: { id: "user-1" } } });
    expect(await createAccountAction({ name: "Fixture bank", type: "Bank" })).toEqual({
      data: { id: "account-1", name: "Fixture bank" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({ user_id: "user-1", name: "Fixture bank", type: "Bank" });
  });
});
