import { NextResponse } from "next/server";
import { getProjectById, getProjectBillingSummary, insertDocument } from "@/lib/data";
import {
  addDocumentCompanyPdfFooter,
  addDocumentCompanyPdfHeader,
} from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

const BUCKET = "attachments";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  if (!projectId)
    return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const [project, billing, canonical, company] = await Promise.all([
      getProjectById(projectId),
      getProjectBillingSummary(projectId),
      getCanonicalProjectProfit(projectId),
      fetchDocumentCompanyProfile(),
    ]);
    if (!project)
      return NextResponse.json({ ok: false, message: "Project not found" }, { status: 404 });
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
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `final-invoice-${ts}.pdf`;
    const filePath = `projects/${projectId}/closeout/${fileName}`;
    const supabase = getServerSupabaseAdmin();
    if (!supabase)
      return NextResponse.json({ ok: false, message: "Supabase not configured" }, { status: 500 });
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buf, { contentType: "application/pdf", upsert: true });
    if (uploadError)
      return NextResponse.json({ ok: false, message: uploadError.message }, { status: 500 });
    await insertDocument({
      file_name: `Final Invoice - ${project.name}.pdf`,
      file_path: filePath,
      file_type: "Invoice",
      mime_type: "application/pdf",
      size_bytes: buf.byteLength,
      project_id: projectId,
      related_module: "closeout",
      related_id: "final-invoice",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
