import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { getCloseoutPunch, getProjectById } from "@/lib/data";
import {
  addDocumentCompanyPdfFooter,
  addDocumentCompanyPdfHeader,
} from "@/lib/document-company-pdf";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { uploadDocumentFile } from "@/lib/document-storage";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(_req, {
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
    const [punch, project, company] = await Promise.all([
      getCloseoutPunch(projectId, guard.client),
      getProjectById(projectId, guard.client),
      fetchDocumentCompanyProfile(),
    ]);
    if (!project)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Project not found" }, { status: 404 }),
        guard.sessionResponse
      );
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
    await uploadDocumentFile(
      guard.client,
      {
        file_name: `Final Punch List - ${project.name}.pdf`,
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
