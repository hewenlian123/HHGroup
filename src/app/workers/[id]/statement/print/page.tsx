import { notFound } from "next/navigation";
import { getWorkerById, getWorkerEarningsAllocations, getWorkerLaborPayments } from "@/lib/data";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";

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

  const [worker, company] = await Promise.all([getWorkerById(id), fetchDocumentCompanyProfile()]);
  if (!worker) notFound();

  const earningsRows = await getWorkerEarningsAllocations(id, start, end, project);
  const payments = await getWorkerLaborPayments(id, start, end);
  const earningsTotal = earningsRows.reduce((s, r) => s + r.amount, 0);
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, earningsTotal - paidTotal);

  return (
    <div className="min-h-screen bg-white text-black p-8 mx-auto" style={{ maxWidth: "8.5in" }}>
      <DocumentCompanyHeader
        company={company}
        documentTitle="Worker Statement"
        documentNo={`WS-${id.replace(/-/g, "").slice(0, 12)}`}
        documentDate={end}
        documentNoLabel="Statement No"
      />
      <section className="mb-6 text-sm text-zinc-800">
        <p className="font-medium text-zinc-900">
          {worker.name}
          {worker.trade?.trim() ? ` · ${worker.trade.trim()}` : ""}
          {worker.phone?.trim() ? ` · ${worker.phone.trim()}` : ""}
        </p>
        <p className="text-zinc-600 tabular-nums mt-1">
          Period: {start} to {end}
        </p>
      </section>

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
