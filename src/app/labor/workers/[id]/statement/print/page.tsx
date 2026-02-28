import { notFound } from "next/navigation";
import { getWorkerById, getWorkerEarningsAllocations, getWorkerPayments } from "@/lib/data";

export default async function WorkerStatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ start?: string; end?: string; project?: string }>;
}) {
  const { id } = await params;
  const qs = (await searchParams) ?? {};
  const start = qs.start ?? new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const end = qs.end ?? new Date().toISOString().slice(0, 10);
  const project = qs.project || undefined;

  const worker = getWorkerById(id);
  if (!worker) notFound();

  const earningsRows = getWorkerEarningsAllocations(id, start, end, project);
  const payments = getWorkerPayments(id, start, end);
  const earningsTotal = earningsRows.reduce((s, r) => s + r.amount, 0);
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, earningsTotal - paidTotal);

  return (
    <div className="min-h-screen bg-white text-black p-8 mx-auto" style={{ maxWidth: "8.5in" }}>
      <header className="border-b border-zinc-300 pb-4 mb-6">
        <h1 className="text-2xl font-bold">HH Group</h1>
        <p className="text-lg font-semibold mt-1">Worker Statement</p>
        <p className="text-sm mt-2">{worker.name} {worker.trade ? `• ${worker.trade}` : ""} {worker.phone ? `• ${worker.phone}` : ""}</p>
        <p className="text-sm text-zinc-600">Period: {start} to {end}</p>
      </header>

      <section className="grid grid-cols-3 gap-3 mb-6 text-sm">
        <div className="border border-zinc-300 rounded-lg p-3">
          <p className="text-zinc-500">Total Earnings</p>
          <p className="text-lg font-semibold tabular-nums">${earningsTotal.toLocaleString()}</p>
        </div>
        <div className="border border-zinc-300 rounded-lg p-3">
          <p className="text-zinc-500">Total Paid</p>
          <p className="text-lg font-semibold tabular-nums">${paidTotal.toLocaleString()}</p>
        </div>
        <div className="border border-zinc-300 rounded-lg p-3">
          <p className="text-zinc-500">Balance</p>
          <p className="text-lg font-semibold tabular-nums">${balance.toLocaleString()}</p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Earnings detail</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-zinc-300">
              <th className="text-left py-2 font-semibold">Date</th>
              <th className="text-left py-2 font-semibold">Project</th>
              <th className="text-left py-2 font-semibold">Shift</th>
              <th className="text-right py-2 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {earningsRows.map((row, idx) => (
              <tr key={`${row.date}-${row.projectId}-${row.shift}-${idx}`} className="border-b border-zinc-200">
                <td className="py-2">{row.date}</td>
                <td className="py-2">{row.projectName}</td>
                <td className="py-2">{row.shift}</td>
                <td className="py-2 text-right tabular-nums">${row.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Payments</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-zinc-300">
              <th className="text-left py-2 font-semibold">Payment Date</th>
              <th className="text-left py-2 font-semibold">Method</th>
              <th className="text-right py-2 font-semibold">Amount</th>
              <th className="text-left py-2 font-semibold">Memo</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-zinc-200">
                <td className="py-2">{p.paymentDate}</td>
                <td className="py-2">{p.method}</td>
                <td className="py-2 text-right tabular-nums">${p.amount.toLocaleString()}</td>
                <td className="py-2">{p.memo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-10 pt-6 border-t border-zinc-200 text-xs text-zinc-500">
        <p>This statement is for internal payroll tracking.</p>
      </footer>
    </div>
  );
}
