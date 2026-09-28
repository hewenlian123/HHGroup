import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

let rendered: Record<string, string>;
beforeAll(() => {
  // Use the installed TSX runtime for JSX; the project Vitest transform preserves JSX.
  rendered = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--eval",
        `
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    const actionPath = require.resolve("./src/app/financial/accounts/actions.ts");
    require.cache[actionPath] = { id: actionPath, filename: actionPath, loaded: true, exports: {} };
    const { BankReconciliationOverview } = require("./src/app/financial/accounts/accounts-client.tsx");
    const zero = { bankBalance: 0, systemExpenses: 0, reconciledBankTotal: 0, unreconciledBankTotal: 0, cashDifference: 0, recentUnreconciled: [] };
    const data = { ...zero, bankBalance: 374.75, systemExpenses: 200.5, reconciledBankTotal: 500, unreconciledBankTotal: -125.25, cashDifference: 174.25 };
    const render = (cashOverview, loading = false) => renderToStaticMarkup(React.createElement(BankReconciliationOverview, { cashOverview, loading, onRetry() {} }));
    process.stdout.write(JSON.stringify({ empty: render(zero), data: render(data), unavailable: render(null), refreshing: render(data, true) }));
  `,
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    )
  );
});

describe("Accounts financial display states", () => {
  it("shows true zero only after successful empty reads", () => {
    expect(rendered.empty.match(/\$0\.00/g)).toHaveLength(5);
    expect(rendered.empty).toContain("No unreconciled transactions");
    expect(rendered.empty).not.toContain("unavailable");
  });
  it("preserves nonzero cash values and the cash difference display", () => {
    expect(rendered.data).toContain("$374.75");
    expect(rendered.data).toContain("$174.25");
    expect(rendered.data).toContain("$200.50");
  });
  it("failed or denied reads display unavailable and retry without zero or empty claims", () => {
    expect(rendered.unavailable).toContain("Bank reconciliation unavailable");
    expect(rendered.unavailable).toContain("Retry bank reconciliation");
    expect(rendered.unavailable).not.toContain("$0.00");
    expect(rendered.unavailable).not.toContain("No unreconciled transactions");
  });
  it("hides stale amounts while a refreshed read is pending", () => {
    expect(rendered.refreshing).toContain("Loading bank reconciliation");
    expect(rendered.refreshing).not.toContain("$374.75");
    expect(rendered.refreshing).not.toContain("$0.00");
  });
});
