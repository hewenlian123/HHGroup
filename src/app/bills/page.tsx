import { financePathWithReturn, financeWorkspacePath } from "@/lib/finance-navigation";
import { FinanceContextBack } from "@/components/financial/finance-context-back";
import { PageLayout, PageHeader, NeoPanel } from "@/components/base";
import { sectionCardClass } from "@/components/ui/section-card";
import { fetchBillsPageData } from "./bills-api";
import { BillsListClient } from "./bills-list-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  billsContentMaxClass,
  billsPageWrapClass,
  billsPrimaryButtonClass,
} from "./bills-ui-styles";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    bill_type?: string;
    project_id?: string;
    date_from?: string;
    date_to?: string;
    overdue_only?: string;
    show_void_bills?: string;
  }>;
};

export default async function BillsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = {
    search: sp.search ?? undefined,
    status: sp.status ?? undefined,
    bill_type: sp.bill_type ?? undefined,
    project_id: sp.project_id ?? undefined,
    date_from: sp.date_from ?? undefined,
    date_to: sp.date_to ?? undefined,
    overdue_only: sp.overdue_only ?? undefined,
    show_void_bills: sp.show_void_bills ?? undefined,
  };
  const { available, message, bills, summary, projects } = await fetchBillsPageData(filters);

  return (
    <PageLayout
      frame="list"
      className={billsPageWrapClass}
      header={
        <div className="hidden md:block">
          <PageHeader
            variant="workspace"
            title="Bills"
            description="Track vendor, labor, and other payables"
            actions={
              <Button asChild size="sm" className={billsPrimaryButtonClass}>
                <Link
                  href={financePathWithReturn("/bills/new", financeWorkspacePath("/bills", sp))}
                >
                  + New Bill
                </Link>
              </Button>
            }
          />
        </div>
      }
    >
      <FinanceContextBack />
      <div className={billsContentMaxClass}>
        {!available ? (
          <NeoPanel className={sectionCardClass} bodyClassName="px-4 py-5 md:px-6">
            <p className="text-hh-body-strong text-[var(--hh-text-primary)]">
              Bills/AP is unavailable
            </p>
            <p className="mt-1 text-hh-table-cell text-[var(--hh-text-secondary)]">
              {message ?? "Bills/AP module is not configured in this environment."}
            </p>
          </NeoPanel>
        ) : (
          <BillsListClient bills={bills} summary={summary} projects={projects} />
        )}
      </div>
    </PageLayout>
  );
}
