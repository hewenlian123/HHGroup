import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getProjectById, getSubcontractById } from "@/lib/data";
import { SubcontractDetailClient } from "./subcontract-detail-client";

type Props = { params: Promise<{ id: string; subId: string }> };

export default async function SubcontractDetailPage({ params }: Props) {
  const { id: projectId, subId } = await params;
  const [project, subcontract] = await Promise.all([getProjectById(projectId), getSubcontractById(subId)]);
  if (!project || !subcontract || subcontract.project_id !== projectId) notFound();

  return (
    <PageLayout
      header={
        <PageHeader
          title={subcontract.subcontractor_name}
          description="Contract details and status."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/projects/${projectId}/subcontracts`} className="text-sm text-muted-foreground hover:text-foreground">
                Subcontracts
              </Link>
              <SubcontractDetailClient projectId={projectId} subcontract={subcontract} />
            </div>
          }
        />
      }
    >
      <SectionHeader label="Contract" />
      <Divider />
      <div className="grid grid-cols-1 gap-y-3 py-4 text-sm max-w-2xl">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">Cost code</span>
          <span>{subcontract.cost_code ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">Contract amount</span>
          <span className="tabular-nums">${subcontract.contract_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">Start</span>
          <span className="tabular-nums">{subcontract.start_date ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">End</span>
          <span className="tabular-nums">{subcontract.end_date ?? "—"}</span>
        </div>
        {subcontract.description ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-muted-foreground">Description</span>
            <span>{subcontract.description}</span>
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}

