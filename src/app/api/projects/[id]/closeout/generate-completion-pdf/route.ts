import { getCloseoutCompletion } from "@/lib/data";
import {
  addDocumentCompanyPdfFooter,
  addDocumentCompanyPdfHeader,
} from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import {
  authorizeProjectPdfMutation,
  type CompletionPdfRequestBody,
  persistGeneratedProjectPdf,
  projectPdfGenerationFailure,
} from "@/lib/project-pdf-security";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const authorization = await authorizeProjectPdfMutation({
    kind: "completion-certificate",
    projectId,
    request: req,
  });
  if (!authorization.ok) return authorization.response;
  const { admin, project } = authorization.context;
  const body = authorization.context.body as CompletionPdfRequestBody;

  try {
    const projectName = body.projectName ?? "";
    const completionDate = body.completion_date ?? "";
    const contractorName = body.contractor_name ?? "";
    const clientName = body.client_name ?? "";
    void projectName;
    const [completion, company] = await Promise.all([
      getCloseoutCompletion(projectId, admin),
      fetchDocumentCompanyProfile(),
    ]);
    const name = project.name;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = await addDocumentCompanyPdfHeader(doc, company, {
      title: "Completion Certificate",
      documentNo: `CC-${projectId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      documentNoLabel: "Certificate No",
      documentDate:
        completionDate || completion?.completion_date || new Date().toISOString().slice(0, 10),
    });
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
      y += 8;
    }
    y += 6;
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
