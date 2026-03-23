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

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Subcontractor
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cost Code
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Contract Amount
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Start Date
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                End Date
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {subcontracts.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={7} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No subcontracts yet.
                </td>
              </tr>
            ) : (
              subcontracts.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3 font-medium">
                    <Link
                      href={`/projects/${id}/subcontracts/${r.id}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {r.subcontractor_name}
                    </Link>
                  </td>
                  <td className="py-1.5 px-3 text-muted-foreground">{r.cost_code ?? "—"}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">
                    ${fmtUsd(r.contract_amount)}
                  </td>
                  <td className="py-1.5 px-3">{r.status ?? "Draft"}</td>
                  <td className="py-1.5 px-3 tabular-nums">{r.start_date ?? "—"}</td>
                  <td className="py-1.5 px-3 tabular-nums">{r.end_date ?? "—"}</td>
                  <td className="py-1.5 px-3 text-right">
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
    </PageLayout>
  );
}
