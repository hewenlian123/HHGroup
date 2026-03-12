import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptActions } from "./receipt-actions";
import { getProjectById, getWorkerById, getWorkerPaymentById } from "@/lib/data";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function WorkerPaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const payment = await getWorkerPaymentById(id);
  if (!payment) notFound();

  const [worker, project] = await Promise.all([
    getWorkerById(payment.workerId),
    payment.projectId ? getProjectById(payment.projectId) : Promise.resolve(undefined),
  ]);
  if (!worker) notFound();

  const projectName = project?.name ?? (payment.projectId ? payment.projectId : "—");

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @page { size: letter; margin: 0.75in; }
        @media print {
          html, body { background: white !important; }
        }
      `}</style>

      <div className="mx-auto p-8" style={{ maxWidth: "8.5in" }}>
        <div className="flex items-start justify-between gap-4 border-b border-zinc-300 pb-4 mb-6">
          <div className="text-center w-full">
            <div className="text-sm font-semibold tracking-wide">HH Construction Inc</div>
            <h1 className="text-2xl font-bold mt-1">WORKER PAYMENT RECEIPT</h1>
          </div>

          <div className="shrink-0 flex items-center gap-3 print:hidden">
            <Link href="/labor/payments" className="text-sm text-zinc-600 hover:text-zinc-900">
              Back
            </Link>
            <ReceiptActions />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Company Name</div>
            <div className="mt-1 font-medium">HH Construction Inc</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Receipt ID</div>
            <div className="mt-1 font-mono text-xs break-all">{payment.id}</div>
          </div>
        </div>

        <div className="mt-6">
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="border-b border-zinc-200">
                <td className="py-3 w-56 text-zinc-600">Worker Name</td>
                <td className="py-3 font-medium">{worker.name}</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-3 w-56 text-zinc-600">Project</td>
                <td className="py-3">{projectName}</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-3 w-56 text-zinc-600">Payment Amount</td>
                <td className="py-3 font-semibold tabular-nums">{fmtUsd(payment.amount)}</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-3 w-56 text-zinc-600">Payment Method</td>
                <td className="py-3">{payment.paymentMethod ?? "—"}</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-3 w-56 text-zinc-600">Payment Date</td>
                <td className="py-3 tabular-nums">{payment.paymentDate}</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-3 w-56 text-zinc-600 align-top">Notes</td>
                <td className="py-3 whitespace-pre-wrap">{payment.notes?.trim() ? payment.notes : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-8 text-sm">
          <div>
            <div className="text-zinc-600">Worker Signature:</div>
            <div className="mt-8 border-b border-zinc-400" />
          </div>
          <div>
            <div className="text-zinc-600">Paid By:</div>
            <div className="mt-8 border-b border-zinc-400" />
          </div>
          <div>
            <div className="text-zinc-600">Date:</div>
            <div className="mt-8 border-b border-zinc-400" />
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-zinc-200 text-xs text-zinc-500">
          <p>Keep this receipt for accounting records.</p>
        </div>
      </div>
    </div>
  );
}

