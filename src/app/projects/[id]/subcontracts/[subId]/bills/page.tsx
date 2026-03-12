import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PageLayout,
  PageHeader,
  Divider,
  SectionHeader,
} from "@/components/base";
import { getSubcontractById, getBillsBySubcontract } from "@/lib/data";
import { AddBillButton } from "./add-bill-button";
import { ApproveBillButton } from "./approve-bill-button";
import { BillRowActions } from "./bill-row-actions";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string; subId: string }> };

export default async function SubcontractBillsPage({ params }: Props) {
  const { id: projectId, subId } = await params;
  const [subcontract, bills] = await Promise.all([
    getSubcontractById(subId),
    getBillsBySubcontract(subId),
  ]);

  if (!subcontract || subcontract.project_id !== projectId) notFound();

  return (
    <PageLayout
      header={
        <PageHeader
          title="Subcontract Bills"
          description={`Bills for ${subcontract.subcontractor_name}.`}
          actions={
            <Link
              href={`/projects/${projectId}/subcontracts`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Subcontracts
            </Link>
          }
        />
      }
    >
      <SectionHeader
        label="Bills"
        action={<AddBillButton projectId={projectId} subcontractId={subId} />}
      />
      <Divider />

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Bill Date</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Due</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Amount</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={6} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No bills yet.
                </td>
              </tr>
            ) : (
              bills.map((r) => (
                (() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const overdue = r.due_date && r.due_date < today && r.status !== "Paid" && r.status !== "Void";
                  return (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3 tabular-nums">{r.bill_date}</td>
                  <td className="py-1.5 px-3 tabular-nums">
                    {r.due_date ? (
                      <div className="flex items-center gap-2">
                        <span className={overdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>{r.due_date}</span>
                        {overdue ? (
                          <span className="rounded-sm border border-red-200/70 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-muted-foreground">{r.description ?? "—"}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.amount)}</td>
                  <td className="py-1.5 px-3">{r.status}</td>
                  <td className="py-1.5 px-3 text-right">
                    {r.status === "Pending" ? (
                      <div className="flex items-center justify-end gap-2">
                        <ApproveBillButton billId={r.id} />
                        <BillRowActions projectId={projectId} subcontractId={subId} bill={r} />
                      </div>
                    ) : (
                      <BillRowActions projectId={projectId} subcontractId={subId} bill={r} />
                    )}
                  </td>
                </tr>
                  );
                })()
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
