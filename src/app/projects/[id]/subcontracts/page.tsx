import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getProjectById, getSubcontractsByProject, getSubcontractors } from "@/lib/data";
import { AddSubcontractButton } from "./add-subcontract-button";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function ProjectSubcontractsPage({ params }: Props) {
  const { id } = await params;
  const [project, subcontracts, subcontractors] = await Promise.all([
    getProjectById(id),
    getSubcontractsByProject(id),
    getSubcontractors(),
  ]);

  if (!project) notFound();

  const subcontractorsForDropdown = subcontractors.map((s) => ({ id: s.id, name: s.name }));

  return (
    <PageLayout
      header={
        <PageHeader
          title="Project Subcontracts"
          description={`Subcontracts for ${project.name}.`}
          actions={
            <Link
              href={`/projects/${id}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Project
            </Link>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={project.name} />
      <SectionHeader
        label="Subcontracts"
        action={<AddSubcontractButton projectId={id} subcontractors={subcontractorsForDropdown} />}
      />
      <Divider />

      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Subcontractor
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Cost Code
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Contract Amount
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Status
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Start Date
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  End Date
                </th>
                <th className="h-8 px-3 text-right align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {subcontracts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-xs text-muted-foreground"
                  >
                    No subcontracts yet.
                  </td>
                </tr>
              ) : (
                subcontracts.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-[#F5F7FA] dark:hover:bg-muted/30"
                  >
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                      <Link
                        href={`/projects/${id}/subcontracts/${r.id}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {r.subcontractor_name}
                      </Link>
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                      {r.cost_code ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      ${fmtUsd(r.contract_amount)}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                      {r.status ?? "Draft"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums">
                      {r.start_date ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums">
                      {r.end_date ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle text-[13px]">
                      <Link
                        href={`/projects/${id}/subcontracts/${r.id}/bills`}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        View Bills
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
