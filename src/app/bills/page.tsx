import { PageLayout, PageHeader } from "@/components/base";
import { getApBills, getApBillsSummary, getProjects } from "@/lib/data";
import { BillsListClient } from "./bills-list-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
  }>;
};

export default async function BillsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = {
    search: sp.search ?? undefined,
    status: (sp.status as import("@/lib/data").ApBillStatus) ?? undefined,
    bill_type: (sp.bill_type as import("@/lib/data").ApBillType) ?? undefined,
    project_id: sp.project_id ?? undefined,
    date_from: sp.date_from ?? undefined,
    date_to: sp.date_to ?? undefined,
    overdue_only: sp.overdue_only === "1" || sp.overdue_only === "true",
  };
  const [bills, summary, projects] = await Promise.all([
    getApBills(filters),
    getApBillsSummary(),
    getProjects(),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <PageLayout
      header={
        <PageHeader
          title="Bills"
          description="Track vendor, labor, and other payables"
          actions={
            <Button asChild size="sm" className="h-9 rounded-sm border-[#E5E7EB] bg-white font-medium text-foreground hover:bg-gray-50">
              <Link href="/bills/new">+ New Bill</Link>
            </Button>
          }
        />
      }
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <BillsListClient
          bills={bills}
          summary={summary}
          projects={projectOptions}
        />
      </div>
    </PageLayout>
  );
}
