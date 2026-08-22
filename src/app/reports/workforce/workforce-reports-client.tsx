"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  HandCoins,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, PageLayout } from "@/components/base";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WORKFORCE_REPORT_TABS,
  normalizeWorkforceReportsTab,
  type WorkforceReportsTab,
} from "./workforce-report-tabs";

const overviewShortcuts: Array<{
  tab: Exclude<WorkforceReportsTab, "overview">;
  label: string;
  icon: LucideIcon;
}> = [
  { tab: "payroll", label: "Payroll", icon: BarChart3 },
  { tab: "balances", label: "Balances", icon: ArrowLeftRight },
  { tab: "payments", label: "Payments", icon: WalletCards },
  { tab: "advances", label: "Advances", icon: HandCoins },
  { tab: "reimbursements", label: "Reimbursements", icon: ReceiptText },
  { tab: "statements", label: "Statements", icon: FileText },
];

export function WorkforceReportsClient({
  activeTab,
  children,
}: {
  activeTab: WorkforceReportsTab;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState<WorkforceReportsTab>(activeTab);

  React.useEffect(() => {
    setTab(activeTab);
  }, [activeTab]);

  const handleTabChange = React.useCallback(
    (value: string) => {
      const nextTab = normalizeWorkforceReportsTab(value);
      setTab(nextTab);
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", nextTab);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <PageLayout
      header={
        <PageHeader
          title="Workforce Reports"
          description="Worker payroll, balances, payments, advances, reimbursements, and statements."
          actions={
            <div className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 text-sm text-[var(--hh-text-secondary)]">
              <BarChart3 className="h-4 w-4 text-[var(--hh-text-secondary)]" aria-hidden />
              <span className="truncate">Workforce</span>
            </div>
          }
        />
      }
    >
      {tab === "overview" ? (
        <div className="mb-3 grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {overviewShortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <button
                key={shortcut.tab}
                type="button"
                className="hh-focus-ring group flex min-h-[72px] min-w-0 items-center gap-3 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 text-left text-[var(--hh-text-primary)] shadow-operational transition-colors hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)]"
                onClick={() => handleTabChange(shortcut.tab)}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] text-[var(--hh-text-secondary)]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{shortcut.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--hh-text-secondary)]">
                    Workforce
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={handleTabChange} className="min-w-0">
        <div className="min-w-0 overflow-x-auto pb-1">
          <TabsList className="min-w-max">
            {WORKFORCE_REPORT_TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {children}
      </Tabs>
    </PageLayout>
  );
}
