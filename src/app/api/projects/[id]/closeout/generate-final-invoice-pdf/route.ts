import { getProjectBillingSummary } from "@/lib/data";
import {
  addDocumentCompanyPdfFooter,
  addDocumentCompanyPdfHeader,
} from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import {
  authorizeProjectPdfMutation,
  persistGeneratedProjectPdf,
  projectPdfGenerationFailure,
} from "@/lib/project-pdf-security";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const authorization = await authorizeProjectPdfMutation({
    kind: "final-invoice",
    projectId,
    request: req,
  });
  if (!authorization.ok) return authorization.response;
  const { admin, project } = authorization.context;

  try {
    const [billing, canonical, company] = await Promise.all([
      getProjectBillingSummary(projectId, admin),
      getCanonicalProjectProfit(projectId, admin),
      fetchDocumentCompanyProfile(),
    ]);
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
    return persistGeneratedProjectPdf({
      buffer: buf,
      context: authorization.context,
    });
  } catch {
    return projectPdfGenerationFailure();
  }
}
