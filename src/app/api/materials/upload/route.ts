import { sessionJson } from "@/lib/supabase-response";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { uploadDocumentFile } from "@/lib/document-storage";

export async function POST(req: Request) {
  const guard = await requireOrganizationRequestClient(req, { write: true, noStore: true });
  if (!guard.ok) return guard.response;
  const json = (body: unknown, options?: { status?: number }) =>
    sessionJson(body, guard.sessionResponse, options?.status);
  try {
    const formData = await req.formData();
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
        organization_id: guard.context.organizationId ?? undefined,
        related_module: "materials",
      },
      file
    );
    const response = json({
      ok: true,
      path: document.file_path,
      imageUrl: `/api/materials/photo?path=${encodeURIComponent(document.file_path)}`,
    });
    for (const cookie of guard.sessionResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  } catch (error) {
    return json(
      { ok: false, message: error instanceof Error ? error.message : "Image upload failed." },
      { status: 500 }
    );
  }
}
