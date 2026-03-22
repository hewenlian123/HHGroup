import { notFound } from "next/navigation";
import Link from "next/link";
import { getInvoiceById, getProjectById } from "@/lib/data";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";

/** Company block must reflect latest `company_profile` after Settings saves (no stale RSC cache). */
export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();
  const [project, company] = await Promise.all([
    getProjectById(invoice.projectId),
    fetchDocumentCompanyProfile(),
  ]);

  return (
    <div className="min-h-screen bg-white text-black p-8 mx-auto" style={{ maxWidth: "8.5in" }}>
      <DocumentCompanyHeader
        company={company}
        documentTitle="Invoice"
        documentNo={invoice.invoiceNo}
        documentDate={invoice.issueDate}
        documentNoLabel="Invoice No"
      />

      <section className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Bill to
        </h2>
        <p className="font-medium">{invoice.clientName}</p>
        <p className="text-sm text-zinc-600">{project?.name ?? invoice.projectId}</p>
      </section>

      <section className="mb-6 flex justify-between text-sm">
        <div>
          <span className="text-zinc-500">Issue date:</span> {invoice.issueDate}
        </div>
        <div>
          <span className="text-zinc-500">Due date:</span> {invoice.dueDate}
        </div>
      </section>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-zinc-300">
            <th className="text-left py-2 font-semibold">Description</th>
            <th className="text-right py-2 font-semibold w-20">Qty</th>
            <th className="text-right py-2 font-semibold w-28">Unit price</th>
            <th className="text-right py-2 font-semibold w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((line, idx) => (
            <tr key={idx} className="border-b border-zinc-200">
              <td className="py-2">{line.description}</td>
              <td className="text-right py-2 tabular-nums">{line.qty}</td>
              <td className="text-right py-2 tabular-nums">${line.unitPrice.toLocaleString()}</td>
              <td className="text-right py-2 tabular-nums font-medium">
                ${line.amount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="text-sm space-y-1 text-right min-w-[180px]">
          <div className="flex justify-between">
            <span className="text-zinc-500">Subtotal</span>
            <span className="tabular-nums">${invoice.subtotal.toLocaleString()}</span>
          </div>
          {invoice.taxAmount != null && invoice.taxAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Tax</span>
              <span className="tabular-nums">${invoice.taxAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-2 border-t border-zinc-300">
            <span>Total</span>
            <span className="tabular-nums">${invoice.total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-emerald-700">
            <span>Paid</span>
            <span className="tabular-nums">${invoice.paidTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Balance due</span>
            <span className="tabular-nums">${invoice.balanceDue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {invoice.notes && (
        <section className="mt-8 pt-4 border-t border-zinc-200 text-sm text-zinc-600">
          <p className="font-medium text-zinc-700 mb-1">Terms / Notes</p>
          <p>{invoice.notes}</p>
        </section>
      )}

      <footer className="mt-12 pt-6 border-t border-zinc-200 text-xs text-zinc-500 text-center">
        <p>Thank you for your business.</p>
        <p className="mt-2">
          <Link href={`/financial/invoices/${id}`} className="text-blue-600 underline">
            View in app
          </Link>
        </p>
      </footer>
    </div>
  );
}
