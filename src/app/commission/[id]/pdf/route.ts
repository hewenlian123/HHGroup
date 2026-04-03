import { NextResponse } from "next/server";
import { getCommissionById, getPaymentRecordsByCommissionId, getProjectById } from "@/lib/data";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import {
  generateCommissionSummaryPdfBuffer,
  type CommissionSummaryPaymentRow,
} from "@/lib/commission-summary-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fetchLogoForPdf(
  logoUrl: string | null
): Promise<{ base64: string; format: "PNG" | "JPEG" } | null> {
  if (!logoUrl?.trim()) return null;
  try {
    const res = await fetch(logoUrl.trim(), { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("png")) {
      return { base64: buf.toString("base64"), format: "PNG" };
    }
    if (ct.includes("jpeg") || ct.includes("jpg")) {
      return { base64: buf.toString("base64"), format: "JPEG" };
    }
    if (buf.length >= 2 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { base64: buf.toString("base64"), format: "PNG" };
    }
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
      return { base64: buf.toString("base64"), format: "JPEG" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /commission/[id]/pdf — commission summary PDF (same DB data as Commission Payments).
 * Query: ?download=1 — Content-Disposition: attachment (otherwise inline for iframe preview).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = rawId?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing commission id" }, { status: 400 });
  }

  const commission = await getCommissionById(id);
  if (!commission) {
    return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
  }

  const [project, paymentRows, company] = await Promise.all([
    getProjectById(commission.project_id),
    getPaymentRecordsByCommissionId(id),
    fetchDocumentCompanyProfile(),
  ]);

  const payments: CommissionSummaryPaymentRow[] = paymentRows.map((p) => ({
    payment_date: p.payment_date || "",
    amount: p.amount,
    payment_method: p.payment_method || "",
    note: p.note,
  }));

  const paidAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const outstandingAmount = Math.max(0, commission.commission_amount - paidAmount);

  const logoBase64 = await fetchLogoForPdf(company.logoUrl);

  const buffer = await generateCommissionSummaryPdfBuffer({
    company,
    logoBase64,
    projectName: project?.name?.trim() || "—",
    personName: commission.person_name ?? "",
    role: commission.role ?? "",
    commissionAmount: commission.commission_amount,
    paidAmount,
    outstandingAmount,
    payments,
  });

  const url = new URL(req.url);
  const download =
    url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true";
  const short = id.replace(/-/g, "").slice(0, 8);
  const filename = `commission-summary-${short}.pdf`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
