import { estimateLineTotal, type EstimateItemRow, type CostCode } from "@/lib/data";
import type { EstimateSummaryResult } from "@/lib/data";
import { splitLineItemDesc } from "@/lib/sanitize-line-item-html";
import { LineItemOrScopeBodyPreview } from "../_components/proposal-scope-preview";
import {
  formatPdfLineTotal,
  formatPdfLineUnitPrice,
} from "../_components/estimate-pdf-line-amounts";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import { formatEstimateCurrency } from "../_components/estimate-currency";

type EstimateForProposal = { number: string; status: string; updatedAt: string };
type MetaForProposal = {
  client: { name: string; phone?: string; email?: string; address?: string };
  project: { name: string; siteAddress?: string };
} | null;

export function EstimateProposalContent({
  company,
  estimate,
  meta,
  itemsByCode,
  costCodes,
  summary,
}: {
  company: DocumentCompanyProfileDTO;
  estimate: EstimateForProposal;
  meta: MetaForProposal;
  itemsByCode: Record<string, EstimateItemRow[]>;
  costCodes: CostCode[];
  summary: EstimateSummaryResult;
}) {
  const estimateDateStr = estimate.updatedAt ? estimate.updatedAt.slice(0, 10) : "—";
  const statusLabel = estimate.status === "Converted" ? "Converted to Project" : estimate.status;

  return (
    <div className="mx-auto max-w-[8.5in] px-6 py-6 print:px-0 print:py-0 print:max-w-none">
      <DocumentCompanyHeader
        company={company}
        documentTitle="Estimate"
        documentNo={estimate.number}
        documentDate={estimateDateStr}
        documentNoLabel="Estimate No"
        extraRight={
          <span className="inline-block rounded-sm border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-800">
            {statusLabel}
          </span>
        }
      />

      {meta && (
        <div className="grid grid-cols-2 gap-6 mb-6 estimate-print-section">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Client
            </p>
            <p className="font-medium text-zinc-900">{meta.client.name}</p>
            {meta.client.phone && <p className="text-sm text-zinc-600">{meta.client.phone}</p>}
            {meta.client.email && <p className="text-sm text-zinc-600">{meta.client.email}</p>}
            {meta.client.address && <p className="text-sm text-zinc-600">{meta.client.address}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Project
            </p>
            <p className="font-medium text-zinc-900">{meta.project.name}</p>
            {meta.project.siteAddress && (
              <p className="text-sm text-zinc-600">{meta.project.siteAddress}</p>
            )}
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Scope of work
        </h2>
        {Object.entries(itemsByCode).length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">No line items.</p>
        ) : (
          Object.entries(itemsByCode).map(([code, rows]) => {
            const cc = costCodes.find((c) => c.code === code)!;
            const sectionSubtotal = rows.reduce((s, r) => s + estimateLineTotal(r), 0);
            return (
              <div key={code} className="mb-6 estimate-print-section">
                <p className="text-sm font-semibold text-zinc-900 mb-2">{cc.name}</p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-zinc-600">
                        Description
                      </th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-zinc-600 tabular-nums">
                        Qty
                      </th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-zinc-600">
                        Unit
                      </th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-zinc-600 tabular-nums">
                        Unit price
                      </th>
                      <th className="text-right py-2 pl-4 text-xs font-semibold text-zinc-600 tabular-nums">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const { title: lineTitle, body } = splitLineItemDesc(row.desc ?? "");
                      return (
                        <tr key={row.id} className="border-b border-zinc-100">
                          <td className="py-2 pr-4 text-zinc-900">
                            <p className="font-medium">{lineTitle || row.desc}</p>
                            {body.trim() ? (
                              <div className="mt-1 text-xs text-zinc-600">
                                <LineItemOrScopeBodyPreview body={body} variant="print" />
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-zinc-900">
                            {row.qty}
                          </td>
                          <td className="py-2 px-2 text-zinc-600">{row.unit}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-zinc-900">
                            {formatPdfLineUnitPrice(row, formatEstimateCurrency)}
                          </td>
                          <td className="py-2 pl-4 text-right tabular-nums font-medium text-zinc-900">
                            {formatPdfLineTotal(row, formatEstimateCurrency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-right text-xs tabular-nums text-zinc-500 mt-2">
                  {formatEstimateCurrency(sectionSubtotal)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-end mb-6 estimate-print-section">
        <div className="w-56 border-t border-zinc-200 pt-4 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-zinc-600">Subtotal</span>
            <span className="tabular-nums font-medium text-zinc-900">
              {formatEstimateCurrency(summary.subtotal)}
            </span>
          </div>
          {summary.tax !== 0 && (
            <div className="flex justify-between py-1">
              <span className="text-zinc-600">Tax</span>
              <span className="tabular-nums font-medium text-zinc-900">
                {formatEstimateCurrency(summary.tax)}
              </span>
            </div>
          )}
          {summary.discount !== 0 && (
            <div className="flex justify-between py-1">
              <span className="text-zinc-600">Discount</span>
              <span className="tabular-nums font-medium text-zinc-900">
                {formatEstimateCurrency(-summary.discount)}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-2 mt-2 border-t border-zinc-200 font-semibold">
            <span className="text-zinc-900">Grand Total</span>
            <span className="tabular-nums text-zinc-900">
              {formatEstimateCurrency(summary.grandTotal)}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-8 whitespace-pre-wrap">
        {company.defaultTerms || "Terms: Net 7. This estimate is valid for 30 days."}
      </p>

      <footer className="text-xs text-zinc-400 border-t border-zinc-100 pt-4 whitespace-pre-wrap">
        {company.invoiceFooter || `Generated by ${company.companyName}`}
      </footer>
    </div>
  );
}
