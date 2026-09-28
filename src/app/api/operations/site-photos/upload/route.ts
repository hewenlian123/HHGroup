import { NextResponse } from "next/server";
import { sessionJson } from "@/lib/supabase-response";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { uploadDocumentFile } from "@/lib/document-storage";

export async function POST(req: Request) {
  let sessionResponse: NextResponse | undefined;
  const json = (body: unknown, options?: { status?: number }) =>
    sessionResponse
      ? sessionJson(body, sessionResponse, options?.status)
      : NextResponse.json(body, options);
  try {
    const formData = await req.formData();
    const projectId = String(formData.get("project_id") ?? "").trim();
    if (!projectId)
      return json({ ok: false, message: "Select a project before uploading." }, { status: 400 });
    const guard = await requireOrganizationRequestClient(req, {
      projectId,
      write: true,
      noStore: true,
    });
    if (!guard.ok) return guard.response;
    sessionResponse = guard.sessionResponse;
    const file = formData.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 10 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
    ) {
      return json(
        { ok: false, message: "Choose a JPG, PNG, WebP or GIF image under 10MB." },
        { status: 400 }
      );
    }
    const document = await uploadDocumentFile(
      guard.client,
      {
        file_name: file.name,
        file_type: "Photo",
        mime_type: file.type,
        size_bytes: file.size,
        project_id: projectId,
        related_module: "project_photos",
      },
      file
    );
    return json({ ok: true, path: document.file_path });
  } catch (error) {
    return json(
      { ok: false, message: error instanceof Error ? error.message : "Photo upload failed." },
      { status: 500 }
    );
  }
}
