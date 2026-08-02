import { getSelectionsByProject } from "@/lib/data";
import { addDocumentCompanyPdfHeader } from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import {
  authorizeProjectPdfMutation,
  persistGeneratedProjectPdf,
  projectPdfGenerationFailure,
} from "@/lib/project-pdf-security";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const authorization = await authorizeProjectPdfMutation({
    kind: "material-selections",
    projectId,
    request: req,
  });
  if (!authorization.ok) return authorization.response;
  const { admin, project } = authorization.context;

  try {
    const [selections, company] = await Promise.all([
      getSelectionsByProject(projectId, admin),
      fetchDocumentCompanyProfile(),
    ]);

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
    return persistGeneratedProjectPdf({
      buffer: buf,
      context: authorization.context,
    });
  } catch {
    return projectPdfGenerationFailure();
  }
}
