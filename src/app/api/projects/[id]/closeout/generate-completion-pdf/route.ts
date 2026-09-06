import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { getCloseoutCompletion, getProjectById } from "@/lib/data";
import {
  addDocumentCompanyPdfFooter,
  addDocumentCompanyPdfHeader,
} from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { uploadDocumentFile } from "@/lib/document-storage";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(req, {
    projectId: (await ctx.params).id,
    write: true,
    noStore: true,
  });
  if (!guard.ok) return guard.response;

  const { id: projectId } = await ctx.params;
  if (!projectId)
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 }),
      guard.sessionResponse
    );
  try {
    const body = await req.json().catch(() => ({}));
    const projectName = body.projectName ?? "";
    const completionDate = body.completion_date ?? "";
    const contractorName = body.contractor_name ?? "";
    const clientName = body.client_name ?? "";
    const [completion, project, company] = await Promise.all([
      getCloseoutCompletion(projectId, guard.client),
      getProjectById(projectId, guard.client),
      fetchDocumentCompanyProfile(),
    ]);
    const name = project?.name ?? projectName;
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
    await uploadDocumentFile(
      guard.client,
      {
        file_name: `Completion Certificate - ${name}.pdf`,
        file_type: "Other",
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
