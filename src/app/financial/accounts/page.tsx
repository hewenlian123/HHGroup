import AccountsClient from "./accounts-client";
import { getCashOverview, type CashOverview } from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";

export const dynamic = "force-dynamic";

const EMPTY_CASH: CashOverview = {
  bankBalance: 0,
  systemExpenses: 0,
  reconciledBankTotal: 0,
  unreconciledBankTotal: 0,
  cashDifference: 0,
  recentUnreconciled: [],
  dataLoadWarnings: [],
};

export default async function AccountsPage() {
  const cashResult = await Promise.allSettled([getCashOverview()]);
  let cashOverview: CashOverview = { ...EMPTY_CASH };
  const dataLoadWarnings: string[] = [];

  const [cash] = cashResult;
  if (cash.status === "fulfilled") {
    cashOverview = cash.value;
    dataLoadWarnings.push(...(cash.value.dataLoadWarnings ?? []));
  } else {
    logServerPageDataError("accounts cash overview", cash.reason);
    dataLoadWarnings.push(serverDataLoadWarning(cash.reason, "cash overview"));
  }

  return <AccountsClient cashOverview={cashOverview} dataLoadWarnings={dataLoadWarnings} />;
}
