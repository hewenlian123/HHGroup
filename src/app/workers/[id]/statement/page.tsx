import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { getWorkerById, getLaborEntriesWithJoins, getLaborPaymentsByWorkerId } from "@/lib/data";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function WorkerStatementPage({ params }: Props) {
  const { id } = await params;
  const [worker, entries, payments] = await Promise.all([
    getWorkerById(id),
    getLaborEntriesWithJoins({ worker_id: id }),
    getLaborPaymentsByWorkerId(id),
  ]);

  if (!worker) notFound();

  const hourlyRate = (worker.halfDayRate ?? 0) / 4;
  const entryAmount = (hours: number) => hourlyRate * hours;
  const totalEarned = entries.reduce((s, e) => s + entryAmount(e.hours), 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalEarned - totalPaid;

  return (
    <PageLayout
      header={
        <PageHeader
          title="Worker Statement"
          description={`Earnings and payments for ${worker.name}.`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/workers/${id}`}>
                <Button variant="outline" size="sm" className="rounded-sm">
                  Back to worker
                </Button>
              </Link>
              <Link href="/workers">
                <Button variant="outline" size="sm" className="rounded-sm">
                  All workers
                </Button>
              </Link>
            </div>
          }
        />
      }
    >
      {/* Section 1: Worker header */}
      <div className="flex items-baseline justify-between py-3 border-b border-border/60">
        <h2 className="text-lg font-semibold">{worker.name}</h2>
        <span
          className={`text-xl font-medium tabular-nums ${
            balance > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
          }`}
        >
          Balance: ${fmtUsd(balance)}
        </span>
      </div>
      <Divider />

      {/* Section 2: Earnings table */}
      <SectionHeader label="Earnings" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cost Code
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No earnings.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3 tabular-nums">{e.work_date}</td>
                  <td className="py-1.5 px-3">{e.project_name ?? "—"}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{e.cost_code ?? "—"}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">
                    ${fmtUsd(entryAmount(e.hours))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Divider />

      {/* Section 3: Payments table */}
      <SectionHeader label="Payments" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Method
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={3} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No payments.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3 tabular-nums">{p.payment_date}</td>
                  <td className="py-1.5 px-3">{p.method ?? "—"}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(p.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
