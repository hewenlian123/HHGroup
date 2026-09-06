import { sessionJson } from "@/lib/supabase-response";
import { getProjectById, getSelectionsByProject } from "@/lib/data";
import { addDocumentCompanyPdfHeader } from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { uploadDocumentFile } from "@/lib/document-storage";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const guard = await requireOrganizationRequestClient(_req, {
    projectId,
    write: true,
    noStore: true,
  });
  if (!guard.ok) return guard.response;
  const json = (body: unknown, options?: { status?: number }) =>
    sessionJson(body, guard.sessionResponse, options?.status);

  if (!projectId) return json({ ok: false, message: "Missing project id" }, { status: 400 });

  try {
    const supabase = guard.client;
    const [project, selections, company] = await Promise.all([
      getProjectById(projectId, supabase),
      getSelectionsByProject(projectId, supabase),
      fetchDocumentCompanyProfile(),
    ]);
    if (!project) return json({ ok: false, message: "Project not found" }, { status: 404 });

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = await addDocumentCompanyPdfHeader(doc, company, {
      title: "Material Selections",
      documentNo: `MS-${projectId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      documentNoLabel: "Export No",
      documentDate: new Date().toISOString().slice(0, 10),
    });
    doc.setFont("helvetica", "normal");

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
    await uploadDocumentFile(
      supabase,
      {
        file_name: `Material Selections - ${project.name}.pdf`,
        file_type: "Other",
        mime_type: "application/pdf",
        size_bytes: buf.byteLength,
        project_id: projectId,
        related_module: "materials",
        related_id: null,
      },
      buf
    );

    return json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return json({ ok: false, message }, { status: 500 });
  }
}
