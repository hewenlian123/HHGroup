import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import type { PermissionKey } from "@/lib/permissions";
import { getServerSupabaseAdmin, getStrictSupabaseRequestAuth } from "@/lib/supabase-server";

const BUCKET = "attachments";
const MAX_JSON_BODY_BYTES = 4_096;

const projectIdSchema = z.string().trim().uuid();
const idempotencyKeySchema = z
  .string()
  .trim()
  .uuid()
  .transform((value) => value.toLowerCase());
const emptyBodySchema = z.object({}).strict();

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const completionBodySchema = z
  .object({
    projectName: z.string().max(300).optional(),
    completion_date: z
      .string()
      .max(10)
      .refine((value) => value === "" || isCalendarDate(value))
      .optional(),
    contractor_name: z.string().max(500).optional(),
    client_name: z.string().max(500).optional(),
  })
  .strict();

export type ProjectPdfKind =
  | "completion-certificate"
  | "final-invoice"
  | "final-punch"
  | "material-selections";

type ProjectPdfConfig = {
  displayTitle: string;
  fileType: "Invoice" | "Other";
  folder: "closeout" | "materials";
  permission: PermissionKey;
  relatedModule: "closeout" | "materials";
};

const PROJECT_PDF_CONFIG: Record<ProjectPdfKind, ProjectPdfConfig> = {
  "material-selections": {
    displayTitle: "Material Selections",
    fileType: "Other",
    folder: "materials",
    permission: "projects.update",
    relatedModule: "materials",
  },
  "completion-certificate": {
    displayTitle: "Completion Certificate",
    fileType: "Other",
    folder: "closeout",
    permission: "projects.update",
    relatedModule: "closeout",
  },
  "final-invoice": {
    displayTitle: "Final Invoice",
    fileType: "Invoice",
    folder: "closeout",
    permission: "finance.manage",
    relatedModule: "closeout",
  },
  "final-punch": {
    displayTitle: "Final Punch List",
    fileType: "Other",
    folder: "closeout",
    permission: "projects.update",
    relatedModule: "closeout",
  },
};

export type CompletionPdfRequestBody = z.infer<typeof completionBodySchema>;

export type AuthorizedProjectPdfContext = {
  admin: SupabaseClient;
  body: CompletionPdfRequestBody | Record<string, never>;
  idempotencyKey: string;
  kind: ProjectPdfKind;
  project: {
    client_name: string | null;
    id: string;
    name: string;
  };
  user: User;
};

export type AuthorizedProjectPdfResult =
  | { context: AuthorizedProjectPdfContext; ok: true }
  | { ok: false; response: NextResponse };

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

async function parseRequestBody(
  request: Request,
  kind: ProjectPdfKind
): Promise<CompletionPdfRequestBody | Record<string, never> | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) return null;

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return null;
  }
  if (raw.length > MAX_JSON_BODY_BYTES) return null;

  let parsed: unknown = {};
  if (raw.length > 0) {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (contentType?.toLowerCase() !== "application/json") return null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const schema = kind === "completion-certificate" ? completionBodySchema : emptyBodySchema;
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Strict route-local guard for Project PDF mutations.
 *
 * The current database is single-tenant and has no organization/project-membership
 * relation. Existing role permissions are therefore the narrowest supported access
 * boundary. The service-role client is created only after verified Auth and the
 * user-scoped has_perm RPC both succeed.
 */
export async function authorizeProjectPdfMutation(input: {
  kind: ProjectPdfKind;
  projectId: string;
  request: Request;
}): Promise<AuthorizedProjectPdfResult> {
  const parsedProjectId = projectIdSchema.safeParse(input.projectId);
  if (!parsedProjectId.success) {
    return { ok: false, response: jsonError(400, "Invalid project id.") };
  }

  const sameOrigin = validateSameOriginMutation(input.request);
  if (!sameOrigin.ok) {
    return { ok: false, response: jsonError(403, "Cross-site request rejected.") };
  }

  const parsedIdempotencyKey = idempotencyKeySchema.safeParse(
    input.request.headers.get("idempotency-key") ?? ""
  );
  if (!parsedIdempotencyKey.success) {
    return { ok: false, response: jsonError(400, "Invalid request.") };
  }

  const body = await parseRequestBody(input.request, input.kind);
  if (!body) {
    return { ok: false, response: jsonError(400, "Invalid request.") };
  }

  const auth = await getStrictSupabaseRequestAuth(input.request);
  if (!auth) {
    return { ok: false, response: jsonError(401, "Authentication required.") };
  }

  const permission = PROJECT_PDF_CONFIG[input.kind].permission;
  try {
    const { data, error } = await auth.client.rpc("has_perm", { p_key: permission });
    if (error || data !== true) {
      return { ok: false, response: jsonError(403, "Project access denied.") };
    }
  } catch {
    return { ok: false, response: jsonError(403, "Project access denied.") };
  }

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return { ok: false, response: projectPdfGenerationFailure() };
  }

  try {
    const { data: project, error } = await admin
      .from("projects")
      .select("id, name, client_name")
      .eq("id", parsedProjectId.data)
      .maybeSingle();
    if (error) {
      return { ok: false, response: projectPdfGenerationFailure() };
    }
    if (!project) {
      return { ok: false, response: jsonError(404, "Project not found.") };
    }

    return {
      ok: true,
      context: {
        admin,
        body,
        idempotencyKey: parsedIdempotencyKey.data,
        kind: input.kind,
        project: {
          client_name: typeof project.client_name === "string" ? project.client_name : null,
          id: String(project.id),
          name: String(project.name ?? ""),
        },
        user: auth.user,
      },
    };
  } catch {
    return { ok: false, response: projectPdfGenerationFailure() };
  }
}

function normalizedDocumentFileName(kind: ProjectPdfKind, projectName: string): string {
  const safeName = projectName
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return `${PROJECT_PDF_CONFIG[kind].displayTitle} - ${safeName || "Project"}.pdf`;
}

function isDuplicateStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  if (String(record.status ?? record.statusCode ?? "") === "409") return true;
  return /already exists|duplicate|resource exists/i.test(
    `${String(record.code ?? "")} ${String(record.message ?? "")}`
  );
}

async function existingDocument(
  admin: SupabaseClient,
  filePath: string
): Promise<{
  error: boolean;
  exists: boolean;
}> {
  try {
    const { data, error } = await admin
      .from("documents")
      .select("id")
      .eq("file_path", filePath)
      .maybeSingle();
    return { error: Boolean(error), exists: Boolean(data) };
  } catch {
    return { error: true, exists: false };
  }
}

export async function persistGeneratedProjectPdf(input: {
  buffer: ArrayBuffer;
  context: AuthorizedProjectPdfContext;
}): Promise<NextResponse> {
  const { admin, idempotencyKey, kind, project, user } = input.context;
  const config = PROJECT_PDF_CONFIG[kind];
  const filePath = `projects/${project.id}/${config.folder}/${kind}-${idempotencyKey}.pdf`;

  const beforeUpload = await existingDocument(admin, filePath);
  if (beforeUpload.error) return projectPdfGenerationFailure();
  if (beforeUpload.exists) return NextResponse.json({ ok: true });

  let uploadError: unknown;
  try {
    const upload = await admin.storage.from(BUCKET).upload(filePath, input.buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
    uploadError = upload.error;
  } catch (error) {
    uploadError = error;
  }

  if (uploadError) {
    const afterUpload = await existingDocument(admin, filePath);
    if (!afterUpload.error && afterUpload.exists) return NextResponse.json({ ok: true });
    if (isDuplicateStorageError(uploadError)) {
      return jsonError(409, "PDF generation already in progress.");
    }
    return jsonError(502, "PDF storage failed.");
  }

  try {
    const { error } = await admin
      .from("documents")
      .insert({
        file_name: normalizedDocumentFileName(kind, project.name),
        file_path: filePath,
        file_type: config.fileType,
        mime_type: "application/pdf",
        size_bytes: input.buffer.byteLength,
        project_id: project.id,
        related_module: config.relatedModule,
        related_id: idempotencyKey,
        uploaded_by: user.id,
        notes: null,
      })
      .select("id")
      .single();
    if (error) throw new Error("metadata insert failed");
  } catch {
    const afterInsert = await existingDocument(admin, filePath);
    if (!afterInsert.error && afterInsert.exists) {
      return NextResponse.json({ ok: true });
    }
    if (!afterInsert.error) {
      try {
        await admin.storage.from(BUCKET).remove([filePath]);
      } catch {
        // The response stays generic; operators can reconcile an orphan by exact path.
      }
    }
    return projectPdfGenerationFailure();
  }

  return NextResponse.json({ ok: true });
}

export function projectPdfGenerationFailure(): NextResponse {
  return jsonError(500, "PDF generation failed.");
}
