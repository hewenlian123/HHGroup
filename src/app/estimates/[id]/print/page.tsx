import { notFound } from "next/navigation";
import {
  getEstimateById,
  getEstimateItems,
  getEstimateMeta,
  getCostCodes,
  getEstimateSummary,
  estimateLineTotal,
  type EstimateItemRow,
} from "@/lib/data";
import { AutoprintTrigger } from "./autoprint-trigger";

export default async function EstimatePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { id } = await params;
  const { autoprint } = await searchParams;
  const estimate = getEstimateById(id);
  if (!estimate) notFound();

  const meta = getEstimateMeta(id);
  const items = getEstimateItems(id);
  const costCodes = getCostCodes();
  const summary = getEstimateSummary(id);
  if (!summary) notFound();

  const itemsByCode = costCodes.reduce<Record<string, EstimateItemRow[]>>((acc, cc) => {
    const rows = items.filter((i) => i.costCode === cc.code);
    if (rows.length > 0) acc[cc.code] = rows;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-white text-zinc-900 print:min-h-0" data-read-only="true" role="document" aria-label="Estimate print view">
      <AutoprintTrigger enabled={autoprint === "1"} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: letter; margin: 0.5in; }
              body { background: #fff !important; }
            }
          `,
        }}
      />
      <div className="mx-auto max-w-[8.5in] px-6 py-6 print:px-0 print:py-0 print:max-w-none">
        {/* A) Header */}
        <header className="flex justify-between items-center border-b border-zinc-200 pb-4 mb-6 print:break-after-avoid">
          <div>
            <p className="text-lg font-semibold text-zinc-900">HH Group</p>
            <p className="text-sm text-zinc-500">Estimate</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-zinc-900">Estimate {estimate.number}</p>
            <p className="text-zinc-500">Date: {estimate.updatedAt}</p>
            <span className="inline-block mt-1 rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700">
              {estimate.status}
            </span>
          </div>
        </header>

        {/* B) Client / Project */}
        {meta && (
          <div className="grid grid-cols-2 gap-6 mb-6 estimate-print-section">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Client</p>
              <p className="font-medium text-zinc-900">{meta.client.name}</p>
              <p className="text-sm text-zinc-600">{meta.client.phone}</p>
              <p className="text-sm text-zinc-600">{meta.client.email}</p>
              <p className="text-sm text-zinc-600">{meta.client.address}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Project</p>
              <p className="font-medium text-zinc-900">{meta.project.name}</p>
              <p className="text-sm text-zinc-600">{meta.project.siteAddress}</p>
            </div>
          </div>
        )}

        {/* C) Scope Table */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Scope</h2>
          {Object.entries(itemsByCode).map(([code, rows]) => {
            const cc = costCodes.find((c) => c.code === code)!;
            const sectionSubtotal = rows.reduce((s, r) => s + estimateLineTotal(r), 0);
            return (
              <div key={code} className="mb-6 estimate-print-section">
                <p className="text-sm font-semibold text-zinc-900 mb-2">
                  {cc.code} 00 00 – {cc.name}
                </p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-zinc-600">Description</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-zinc-600 tabular-nums">Qty</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-zinc-600">Unit</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-zinc-600 tabular-nums">Unit Cost</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-zinc-600 tabular-nums">Markup</th>
                      <th className="text-right py-2 pl-4 text-xs font-semibold text-zinc-600 tabular-nums">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-4 text-zinc-900">{row.desc}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-zinc-900">{row.qty}</td>
                        <td className="py-2 px-2 text-zinc-600">{row.unit}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-zinc-900">${row.unitCost.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-zinc-600">{(row.markupPct * 100).toFixed(0)}%</td>
                        <td className="py-2 pl-4 text-right tabular-nums font-medium text-zinc-900">
                          ${estimateLineTotal(row).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-right text-sm font-medium tabular-nums text-zinc-900 mt-2">
                  Section Subtotal: ${sectionSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            );
          })}
        </div>

        {/* D) Summary */}
        <div className="flex justify-end mb-6 estimate-print-section">
          <div className="w-56 border border-zinc-200 rounded-lg p-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-zinc-600">Subtotal</span>
              <span className="tabular-nums font-medium text-zinc-900">${summary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-600">Overhead ({(summary.overheadPct * 100).toFixed(0)}%)</span>
              <span className="tabular-nums font-medium text-zinc-900">${summary.overhead.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-600">Profit ({(summary.profitPct * 100).toFixed(0)}%)</span>
              <span className="tabular-nums font-medium text-zinc-900">${summary.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between pt-2 mt-2 border-t border-zinc-200 font-semibold">
              <span className="text-zinc-900">Grand Total</span>
              <span className="tabular-nums text-zinc-900">${summary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* E) Terms */}
        <p className="text-xs text-zinc-500 mb-8">
          Terms: Net 7. This estimate is valid for 30 days.
        </p>

        {/* F) Footer */}
        <footer className="text-xs text-zinc-400 border-t border-zinc-100 pt-4">
          Generated by HH Unified
        </footer>
      </div>
    </div>
  );
}
