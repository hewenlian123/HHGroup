import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { CloseoutDatabaseError } from "@/lib/project-closeout-db";
import { getServerSupabaseAdmin, getStrictSupabaseRequestAuth } from "@/lib/supabase-server";

const MAX_JSON_BODY_BYTES = 65_536;
const projectIdSchema = z.string().trim().uuid();

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const nullableDate = z.string().length(10).refine(isCalendarDate).nullable();
const nullableName = z.string().max(300).nullable();
const nullableNote = z.string().max(4_000).nullable();
const nullableSignature = z.string().max(2_000).nullable();

const punchBodySchema = z
  .object({
    inspection_date: nullableDate,
    inspector: nullableName,
    notes: nullableNote,
    contractor_signature: nullableSignature,
    client_signature: nullableSignature,
    items: z
      .array(
        z
          .object({
            item: z.string().max(1_000),
            status: z.enum(["pending", "done"]),
          })
          .strict()
      )
      .max(200),
  })
  .strict();

const warrantyBodySchema = z
  .object({
    start_date: nullableDate,
    period_months: z.number().int().min(1).max(1_200),
    notes: nullableNote,
  })
  .strict();

const completionBodySchema = z
  .object({
    completion_date: nullableDate,
    contractor_name: nullableName,
    client_name: nullableName,
    contractor_signature: nullableSignature,
    client_signature: nullableSignature,
  })
  .strict();

export type CloseoutMutationKind = "completion" | "punch" | "warranty";
export type PunchMutationBody = z.infer<typeof punchBodySchema>;
export type WarrantyMutationBody = z.infer<typeof warrantyBodySchema>;
export type CompletionMutationBody = z.infer<typeof completionBodySchema>;
type CloseoutMutationBody = PunchMutationBody | WarrantyMutationBody | CompletionMutationBody;

type AuthorizedCloseoutContext = {
  admin: SupabaseClient;
  body: CloseoutMutationBody;
  projectId: string;
  user: User;
};

export type AuthorizedCloseoutResult =
  | { context: AuthorizedCloseoutContext; ok: true }
  | { ok: false; response: NextResponse };

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

async function parseBody(request: Request, kind: CloseoutMutationKind): Promise<unknown | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) return null;

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return null;

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return null;
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BODY_BYTES) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const schema =
    kind === "punch"
      ? punchBodySchema
      : kind === "warranty"
        ? warrantyBodySchema
        : completionBodySchema;
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

export async function authorizeProjectCloseoutMutation(input: {
  kind: CloseoutMutationKind;
  projectId: string;
  request: Request;
}): Promise<AuthorizedCloseoutResult> {
  const sameOrigin = validateSameOriginMutation(input.request);
  if (!sameOrigin.ok) {
    return { ok: false, response: jsonError(403, "Cross-site request rejected.") };
  }

  const parsedProjectId = projectIdSchema.safeParse(input.projectId);
  if (!parsedProjectId.success) {
    return { ok: false, response: jsonError(400, "Invalid project id.") };
  }

  const body = await parseBody(input.request, input.kind);
  if (!body) return { ok: false, response: jsonError(400, "Invalid request.") };

  const auth = await getStrictSupabaseRequestAuth(input.request);
  if (!auth) {
    return { ok: false, response: jsonError(401, "Authentication required.") };
  }

  try {
    const { data, error } = await auth.client.rpc("has_perm", { p_key: "projects.update" });
    if (error || data !== true) {
      return { ok: false, response: jsonError(403, "Project access denied.") };
    }
  } catch {
    return { ok: false, response: jsonError(403, "Project access denied.") };
  }

  const admin = getServerSupabaseAdmin();
  if (!admin) return { ok: false, response: closeoutMutationFailure(input.kind) };

  try {
    const { data: project, error } = await admin
      .from("projects")
      .select("id")
      .eq("id", parsedProjectId.data)
      .maybeSingle();
    if (error) return { ok: false, response: closeoutMutationFailure(input.kind) };
    if (!project) return { ok: false, response: jsonError(404, "Project not found.") };
  } catch {
    return { ok: false, response: closeoutMutationFailure(input.kind) };
  }

  return {
    ok: true,
    context: {
      admin,
      body: body as CloseoutMutationBody,
      projectId: parsedProjectId.data,
      user: auth.user,
    },
  };
}

export function closeoutMutationFailure(kind: CloseoutMutationKind, error?: unknown): NextResponse {
  const category = error instanceof CloseoutDatabaseError ? error.kind : "unexpected";
  console.error("Project Closeout mutation failed.", { category, kind });
  if (category === "conflict") {
    return jsonError(409, "Closeout update in progress; retry.");
  }
  if (category === "validation") return jsonError(400, "Invalid request.");
  if (category === "not_found") return jsonError(404, "Project not found.");
  return jsonError(500, "Project Closeout update failed.");
}
