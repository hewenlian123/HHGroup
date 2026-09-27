import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { getProjectById, getProjectBillingSummary } from "@/lib/data";
import {
  addDocumentCompanyPdfFooter,
  addDocumentCompanyPdfHeader,
} from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { uploadDocumentFile } from "@/lib/document-storage";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(_req, {
    projectId: (await ctx.params).id,
    write: true,
    noStore: true,
    requireOwnerAdmin: true,
  });
  if (!guard.ok) return guard.response;

  const { id: projectId } = await ctx.params;
  if (!projectId)
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 }),
      guard.sessionResponse
    );
  try {
    const [project, billing, canonical, company] = await Promise.all([
      getProjectById(projectId, guard.client),
      getProjectBillingSummary(projectId, guard.client),
      getCanonicalProjectProfit(projectId, guard.client),
      fetchDocumentCompanyProfile(),
    ]);
    if (!project)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Project not found" }, { status: 404 }),
        guard.sessionResponse
      );
    const contractValue = canonical.revenue;
    const paid = billing.paidTotal;
    const remaining = Math.max(0, contractValue - paid);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = await addDocumentCompanyPdfHeader(doc, company, {
      title: "Final Invoice",
      documentNo: `FI-${projectId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      documentNoLabel: "Invoice No",
      documentDate: new Date().toISOString().slice(0, 10),
    });
    doc.setFontSize(11);
    doc.text(`Project: ${project.name ?? ""}`, 20, y);
    y += 15;
    doc.text(
      `Contract value:     $${contractValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      20,
      y
    );
    y += 8;
    doc.text(
      `Payments received:  $${paid.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      20,
      y
    );
    y += 8;
    doc.text(
      `Remaining balance:  $${remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      20,
      y
    );
    y += 14;
    addDocumentCompanyPdfFooter(doc, company, { y });
    const buf = doc.output("arraybuffer") as ArrayBuffer;
    await uploadDocumentFile(
      guard.client,
      {
        file_name: `Final Invoice - ${project.name}.pdf`,
        file_type: "Invoice",
        mime_type: "application/pdf",
        size_bytes: buf.byteLength,
        project_id: projectId,
        related_module: "closeout",
        related_id: projectId,
      },
      buf
    );
    const response = withSessionCookies(NextResponse.json({ ok: true }), guard.sessionResponse);

    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
