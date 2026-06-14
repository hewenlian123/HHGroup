import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import { formatDate } from "@/lib/formatters";
import {
  formatMaterialSelectionItemStatus,
  formatMaterialSelectionStatus,
  type MaterialSelectionItem,
  type MaterialSelectionSheetWithItems,
} from "@/lib/material-selection-sheets";

type MaterialSelectionDocumentProps = {
  company: DocumentCompanyProfileDTO;
  selection: MaterialSelectionSheetWithItems;
};

function groupItems(items: MaterialSelectionItem[]) {
  const groups = new Map<string, MaterialSelectionItem[]>();
  for (const item of items) {
    const area = item.areaName?.trim() || "Unassigned Area";
    const existing = groups.get(area) ?? [];
    existing.push(item);
    groups.set(area, existing);
  }
  return Array.from(groups.entries()).map(([area, areaItems]) => ({ area, items: areaItems }));
}

function itemSpecs(item: MaterialSelectionItem): Array<[string, string]> {
  return [
    ["Brand", item.brand],
    ["SKU / Model", item.sku],
    ["Size", item.size],
    ["Color", item.color],
    ["Finish", item.finish],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

function MaterialSelectionDocumentStyles() {
  return (
    <style>{`
      .material-selection-a4-page {
        box-sizing: border-box;
        width: min(210mm, calc(100vw - 2rem));
        min-height: calc(min(210mm, calc(100vw - 2rem)) * 1.4142857);
        margin: 0 auto;
        padding: clamp(16px, 6.6667vw, 14mm);
        background: #fff;
        color: #111827;
        overflow: visible;
      }

      .material-selection-a4-page * {
        box-sizing: border-box;
      }

      @media (min-width: 860px) {
        .material-selection-a4-page {
          width: 210mm;
          min-height: 297mm;
          padding: 14mm;
        }
      }

      @media print {
        @page {
          size: A4;
          margin: 0;
        }

        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          color-scheme: light;
        }

        [data-app-sidebar],
        [data-app-main-column] > header,
        .neo-command-bar,
        .no-print {
          display: none !important;
        }

        .app-shell,
        .hh-app-shell,
        .neo-app-shell,
        [data-app-main-column],
        [data-app-scroll-root] {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: none !important;
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background: #fff !important;
        }

        .material-selection-a4-shell {
          width: 210mm !important;
          min-height: 297mm !important;
          max-width: none !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #fff !important;
        }

        .material-selection-a4-page {
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 auto !important;
          padding: 14mm !important;
          box-shadow: none !important;
          border: none !important;
          overflow: visible !important;
        }

        .material-selection-a4-page section,
        .material-selection-a4-page footer,
        .material-selection-item {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `}</style>
  );
}

export function MaterialSelectionDocument({ company, selection }: MaterialSelectionDocumentProps) {
  const groups = groupItems(selection.items);
  const addressText = company.addressLines.join(", ");
  const documentDate = formatDate(selection.updatedAt || selection.createdAt);

  return (
    <>
      <MaterialSelectionDocumentStyles />
      <article
        data-testid="material-selection-document"
        role="document"
        aria-label="Material selection preview"
        className="material-selection-a4-page text-zinc-950"
      >
        <header className="grid gap-6 border-b border-zinc-200 pb-6 sm:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- print/PDF-safe company logo
                <img
                  src={company.logoUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-lg object-contain"
                />
              ) : null}
              <div className="min-w-0">
                <p className="break-words text-[18px] font-semibold leading-tight text-zinc-950">
                  {company.companyName}
                </p>
                <p className="mt-1 text-[11px] uppercase text-zinc-500">
                  Material Selection Record
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-[11.5px] leading-5 text-zinc-500">
              {addressText ? <p>{addressText}</p> : null}
              {[company.phone, company.email, company.website].filter(Boolean).length > 0 ? (
                <p>{[company.phone, company.email, company.website].filter(Boolean).join(" / ")}</p>
              ) : null}
              {company.licenseNumber ? <p>License {company.licenseNumber}</p> : null}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase text-zinc-500">Selection Number</p>
            <p className="mt-2 break-words text-right text-[20px] font-semibold tracking-normal text-zinc-950">
              {selection.selectionNumber || "Draft"}
            </p>
            <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 text-[12px]">
              <div className="flex justify-between gap-4">
                <span className="text-zinc-500">Date</span>
                <span className="font-medium tabular-nums">{documentDate}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-zinc-500">Status</span>
                <span className="font-medium">
                  {formatMaterialSelectionStatus(selection.status)}
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-zinc-500">Customer</p>
            <p className="mt-2 break-words text-[14px] font-semibold text-zinc-950">
              {selection.customerName ?? "—"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-zinc-500">Project</p>
            <p className="mt-2 break-words text-[14px] font-semibold text-zinc-950">
              {selection.projectName ?? "—"}
            </p>
          </div>
        </section>

        <section className="mt-7">
          <div>
            <p className="text-[11px] font-semibold uppercase text-zinc-500">Selection Title</p>
            <h1 className="mt-2 break-words text-[22px] font-semibold leading-tight text-zinc-950">
              {selection.title}
            </h1>
            {selection.notes ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-600">
                {selection.notes}
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-7 space-y-5">
          {groups.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 p-4 text-[13px] text-zinc-500">
              No material items listed.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.area} className="break-inside-avoid">
                <h2 className="border-b border-zinc-200 pb-2 text-[13px] font-semibold uppercase text-zinc-600">
                  {group.area}
                </h2>
                <div className="mt-3 space-y-3">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="material-selection-item grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[84px_minmax(0,1fr)]"
                    >
                      <div className="h-20 w-20 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- print/PDF-safe material photo
                          <img
                            src={item.imageUrl}
                            alt={item.itemName}
                            className="h-full w-full object-contain"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.category ? (
                            <span className="rounded-sm bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
                              {item.category}
                            </span>
                          ) : null}
                          <span className="rounded-sm bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
                            {formatMaterialSelectionItemStatus(item.status)}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-[14px] font-semibold text-zinc-950">
                          {item.itemName}
                        </p>
                        {itemSpecs(item).length > 0 ? (
                          <dl className="mt-2 grid gap-x-4 gap-y-1 text-[12px] leading-5 text-zinc-600 sm:grid-cols-2">
                            {itemSpecs(item).map(([label, value]) => (
                              <div key={label} className="min-w-0">
                                <dt className="inline font-medium text-zinc-500">{label}: </dt>
                                <dd className="inline break-words">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                        {item.notes ? (
                          <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-5 text-zinc-600">
                            {item.notes}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        <footer className="mt-10 space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="border-b border-zinc-300 pb-8 text-[12px] font-medium text-zinc-700">
                Customer Signature / Date
              </p>
            </div>
            <div>
              <p className="border-b border-zinc-300 pb-8 text-[12px] font-medium text-zinc-700">
                Contractor Signature / Date
              </p>
            </div>
          </div>
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11.5px] leading-5 text-zinc-600">
            Material colors, availability, and lead times are subject to final supplier
            confirmation. This document is for customer selection record and approval.
          </p>
        </footer>
      </article>
    </>
  );
}
