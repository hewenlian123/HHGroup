export type WorkforceReportsTab =
  | "overview"
  | "payroll"
  | "balances"
  | "payments"
  | "advances"
  | "reimbursements"
  | "statements";

export const WORKFORCE_REPORT_TABS = [
  { value: "overview", label: "Overview" },
  { value: "payroll", label: "Payroll" },
  { value: "balances", label: "Balances" },
  { value: "payments", label: "Payments" },
  { value: "advances", label: "Advances" },
  { value: "reimbursements", label: "Reimbursements" },
  { value: "statements", label: "Statements" },
] as const satisfies readonly { value: WorkforceReportsTab; label: string }[];

export function normalizeWorkforceReportsTab(
  raw: string | string[] | undefined
): WorkforceReportsTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return WORKFORCE_REPORT_TABS.some((tab) => tab.value === value)
    ? (value as WorkforceReportsTab)
    : "overview";
}
