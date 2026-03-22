import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type DocumentCompanyHeaderProps = {
  company: DocumentCompanyProfileDTO;
  documentTitle: string;
  documentNo: string;
  documentDate: string;
  /** e.g. "Invoice No", "Receipt No" */
  documentNoLabel?: string;
  dateLabel?: string;
  /** Shown under date on the right (e.g. status badge). */
  extraRight?: ReactNode;
  /** Tighter typography for worker receipt layout. */
  density?: "default" | "compact";
  className?: string;
};

/**
 * Unified document header: company profile (left) + document meta (right).
 * Print/PDF-safe: `<img>` for logo, high-contrast zinc palette.
 */
export function DocumentCompanyHeader({
  company,
  documentTitle,
  documentNo,
  documentDate,
  documentNoLabel = "Document No",
  dateLabel = "Date",
  extraRight,
  density = "default",
  className,
}: DocumentCompanyHeaderProps) {
  const compact = density === "compact";

  return (
    <header
      data-testid="document-company-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b border-zinc-300 pb-4 mb-6 print:break-after-avoid text-zinc-900",
        compact && "gap-3 pb-3 mb-4 border-zinc-200",
        className
      )}
    >
      <div className="flex min-w-0 max-w-[65%] flex-col gap-1 sm:max-w-[60%]">
        <div className="flex min-w-0 items-center gap-3">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- print/PDF + external Supabase URL
            <img
              data-testid="document-company-logo"
              src={company.logoUrl}
              alt=""
              width={compact ? 40 : 48}
              height={compact ? 40 : 48}
              className={cn(
                "block shrink-0 object-contain align-middle",
                compact ? "h-10 w-10 max-h-10 max-w-10" : "h-12 w-12 max-h-12 max-w-12"
              )}
            />
          ) : null}
          <p
            data-testid="document-company-name"
            className={cn(
              "min-w-0 font-bold leading-tight text-zinc-950",
              compact ? "text-sm" : "text-base"
            )}
          >
            {company.companyName}
          </p>
        </div>
        <div className="min-w-0 space-y-0.5 text-sm leading-snug text-zinc-800">
          {company.addressLines.map((line, i) => (
            <p key={i} className={cn(compact ? "text-[11px]" : "text-sm")}>
              {line}
            </p>
          ))}
          {company.phone ? (
            <p className={cn("tabular-nums", compact ? "text-[11px]" : "text-sm")}>
              {company.phone}
            </p>
          ) : null}
          {company.email ? (
            <p className={cn("break-all", compact ? "text-[11px]" : "text-sm")}>{company.email}</p>
          ) : null}
          {company.website ? (
            <p className={cn("break-all text-zinc-700", compact ? "text-[11px]" : "text-sm")}>
              {company.website}
            </p>
          ) : null}
          {company.licenseNumber ? (
            <p className={cn("text-zinc-600", compact ? "text-[10px]" : "text-xs")}>
              License: {company.licenseNumber}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={cn("shrink-0 text-right text-sm text-zinc-900", compact ? "text-xs" : "text-sm")}
      >
        <p className={cn("font-bold text-zinc-950", compact ? "text-base" : "text-lg")}>
          {documentTitle}
        </p>
        <p className={cn("mt-1 tabular-nums", compact && "text-[11px]")}>
          <span className="text-zinc-500">{documentNoLabel}</span>{" "}
          <span className="font-semibold text-zinc-900">{documentNo}</span>
        </p>
        <p className={cn("mt-1 tabular-nums", compact && "text-[11px]")}>
          <span className="text-zinc-500">{dateLabel}</span>{" "}
          <span className="font-medium text-zinc-900">{documentDate}</span>
        </p>
        {extraRight ? <div className="mt-2 flex flex-col items-end gap-1">{extraRight}</div> : null}
      </div>
    </header>
  );
}
