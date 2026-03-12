import { NextResponse } from "next/server";
import { getProjectById, getSelectionsByProject, insertDocument } from "@/lib/data";
import { supabase } from "@/lib/supabase";

const BUCKET = "attachments";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await ctx.params;
  if (!projectId) return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });

  try {
    const [project, selections] = await Promise.all([
      getProjectById(projectId),
      getSelectionsByProject(projectId),
    ]);
    if (!project) return NextResponse.json({ ok: false, message: "Project not found" }, { status: 404 });

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = 20;

    doc.setFontSize(16);
    doc.text("Material Selections", 20, y);
    y += 10;

    doc.setFontSize(11);
    doc.text(`Project: ${project.name ?? ""}`, 20, y);
    y += 6;
    const clientName = (project as { client_name?: string }).client_name ?? "";
    if (clientName) {
      doc.text(`Client: ${clientName}`, 20, y);
      y += 8;
    } else {
      y += 4;
    }

    doc.setFontSize(12);
    doc.text("Material items", 20, y);
    y += 6;
    doc.setFontSize(10);

    for (const row of selections) {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.text(`• ${row.item} (${row.category})`, 22, y);
      y += 5;
      doc.text(`  Material: ${row.material_name}`, 24, y);
      y += 4;
      if (row.supplier) {
        doc.text(`  Supplier: ${row.supplier}`, 24, y);
        y += 4;
      }
      if (row.notes) {
        const notesLine = row.notes.slice(0, 80);
        doc.text(`  Notes: ${notesLine}`, 24, y);
        y += 4;
      }
      if (row.material_photo_url) {
        doc.text(`  Photo: [attached]`, 24, y);
        y += 4;
      }
      y += 2;
    }

    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    y += 6;
    doc.setFontSize(12);
    doc.text("Client Approval", 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.text("Signature: ____________________________", 20, y);
    y += 8;
    doc.text("Date: _________________________________", 20, y);

    const buf = doc.output("arraybuffer") as ArrayBuffer;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `material-selections-${ts}.pdf`;
    const filePath = `projects/${projectId}/materials/${fileName}`;

    if (!supabase) return NextResponse.json({ ok: false, message: "Supabase not configured" }, { status: 500 });
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buf, { contentType: "application/pdf", upsert: true });
    if (uploadError) return NextResponse.json({ ok: false, message: uploadError.message }, { status: 500 });

    await insertDocument({
      file_name: `Material Selections - ${project.name}.pdf`,
      file_path: filePath,
      file_type: "Other",
      mime_type: "application/pdf",
      size_bytes: buf.byteLength,
      project_id: projectId,
      related_module: "materials",
      related_id: null,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
