import { NextResponse } from "next/server";
import { getCloseoutPunch, getProjectById, insertDocument } from "@/lib/data";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

const BUCKET = "attachments";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  if (!projectId)
    return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const [punch, project] = await Promise.all([
      getCloseoutPunch(projectId),
      getProjectById(projectId),
    ]);
    if (!project)
      return NextResponse.json({ ok: false, message: "Project not found" }, { status: 404 });
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(16);
    doc.text("Final Punch List", 20, y);
    y += 12;
    doc.setFontSize(11);
    doc.text(`Project: ${project.name ?? ""}`, 20, y);
    y += 8;
    if (punch) {
      if (punch.inspection_date) {
        doc.text(`Inspection date: ${punch.inspection_date}`, 20, y);
        y += 6;
      }
      if (punch.inspector) {
        doc.text(`Inspector: ${punch.inspector}`, 20, y);
        y += 6;
      }
      if (punch.notes) {
        doc.text(`Notes: ${punch.notes}`, 20, y);
        y += 10;
      }
      if (punch.items?.length) {
        y += 5;
        doc.text("Items:", 20, y);
        y += 6;
        doc.setFontSize(10);
        for (const row of punch.items) {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.text(`• ${row.item} [${row.status}]`, 25, y);
          y += 6;
        }
        doc.setFontSize(11);
        y += 5;
      }
      if (punch.contractor_signature) {
        doc.text(`Contractor: ${punch.contractor_signature}`, 20, y);
        y += 6;
      }
      if (punch.client_signature) {
        doc.text(`Client: ${punch.client_signature}`, 20, y);
      }
    }
    const buf = doc.output("arraybuffer") as ArrayBuffer;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `final-punch-${ts}.pdf`;
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
      file_name: `Final Punch List - ${project.name}.pdf`,
      file_path: filePath,
      file_type: "Other",
      mime_type: "application/pdf",
      size_bytes: buf.byteLength,
      project_id: projectId,
      related_module: "closeout",
      related_id: "punch",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
