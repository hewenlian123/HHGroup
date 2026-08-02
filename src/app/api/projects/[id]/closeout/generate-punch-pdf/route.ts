import { getCloseoutPunch } from "@/lib/data";
import {
  addDocumentCompanyPdfFooter,
  addDocumentCompanyPdfHeader,
} from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import {
  authorizeProjectPdfMutation,
  persistGeneratedProjectPdf,
  projectPdfGenerationFailure,
} from "@/lib/project-pdf-security";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const authorization = await authorizeProjectPdfMutation({
    kind: "final-punch",
    projectId,
    request: req,
  });
  if (!authorization.ok) return authorization.response;
  const { admin, project } = authorization.context;

  try {
    const [punch, company] = await Promise.all([
      getCloseoutPunch(projectId, admin),
      fetchDocumentCompanyProfile(),
    ]);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = await addDocumentCompanyPdfHeader(doc, company, {
      title: "Final Punch List",
      documentNo: `FP-${projectId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      documentNoLabel: "Punch No",
      documentDate: punch?.inspection_date || new Date().toISOString().slice(0, 10),
    });
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
        y += 6;
      }
    }
    y += 8;
    addDocumentCompanyPdfFooter(doc, company, { y });
    const buf = doc.output("arraybuffer") as ArrayBuffer;
    return persistGeneratedProjectPdf({
      buffer: buf,
      context: authorization.context,
    });
  } catch {
    return projectPdfGenerationFailure();
  }
}
