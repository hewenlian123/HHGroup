import { NextResponse } from "next/server";
import { getCloseoutCompletion, getProjectById, insertDocument } from "@/lib/data";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

const BUCKET = "attachments";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await ctx.params;
  if (!projectId) return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    const projectName = body.projectName ?? "";
    const completionDate = body.completion_date ?? "";
    const contractorName = body.contractor_name ?? "";
    const clientName = body.client_name ?? "";
    const [completion, project] = await Promise.all([
      getCloseoutCompletion(projectId),
      getProjectById(projectId),
    ]);
    const name = project?.name ?? projectName;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text("Completion Certificate", 20, y);
    y += 15;
    doc.setFontSize(11);
    doc.text(`Project: ${name}`, 20, y);
    y += 8;
    doc.text(`Completion date: ${completionDate || completion?.completion_date || "—"}`, 20, y);
    y += 12;
    doc.text(`Contractor: ${contractorName || completion?.contractor_name || "—"}`, 20, y);
    y += 8;
    doc.text(`Client: ${clientName || completion?.client_name || "—"}`, 20, y);
    y += 12;
    if (completion?.contractor_signature) {
      doc.text(`Contractor signature: ${completion.contractor_signature}`, 20, y);
      y += 8;
    }
    if (completion?.client_signature) {
      doc.text(`Client signature: ${completion.client_signature}`, 20, y);
    }
    const buf = doc.output("arraybuffer") as ArrayBuffer;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `completion-certificate-${ts}.pdf`;
    const filePath = `projects/${projectId}/closeout/${fileName}`;
    const supabase = getServerSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, message: "Supabase not configured" }, { status: 500 });
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buf, { contentType: "application/pdf", upsert: true });
    if (uploadError) return NextResponse.json({ ok: false, message: uploadError.message }, { status: 500 });
    await insertDocument({
      file_name: `Completion Certificate - ${name}.pdf`,
      file_path: filePath,
      file_type: "Other",
      mime_type: "application/pdf",
      size_bytes: buf.byteLength,
      project_id: projectId,
      related_module: "closeout",
      related_id: "completion",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
