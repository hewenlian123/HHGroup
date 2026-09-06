import { NextResponse } from "next/server";
import { getInspectionLogById, updateInspectionLog } from "@/lib/data";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(_req, { noStore: true });
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const entry = await getInspectionLogById(id, guard.client);
    if (!entry) {
      return withSessionCookies(
        NextResponse.json({ ok: false as const, message: "Not found." }, { status: 404 }),
        guard.sessionResponse
      );
    }
    return withSessionCookies(
      NextResponse.json({ ok: true as const, entry }),
      guard.sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load inspection.";
    return withSessionCookies(
      NextResponse.json({ ok: false as const, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const body = await req.json();
    const status = body.status !== undefined ? body.status : undefined;
    if (status !== undefined && !["passed", "failed", "pending"].includes(status)) {
      return withSessionCookies(
        NextResponse.json(
          { ok: false as const, message: "status must be passed, failed, or pending." },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    }
    const updated = await updateInspectionLog(
      id,
      {
        inspection_type:
          body.inspection_type !== undefined ? body.inspection_type.trim() : undefined,
        inspector: body.inspector !== undefined ? (body.inspector?.trim() ?? null) : undefined,
        inspection_date:
          body.inspection_date !== undefined
            ? (body.inspection_date?.slice(0, 10) ?? null)
            : undefined,
        status: status as "passed" | "failed" | "pending" | undefined,
        notes: body.notes !== undefined ? (body.notes?.trim() ?? null) : undefined,
      },
      guard.client
    );
    if (!updated) {
      return withSessionCookies(
        NextResponse.json(
          { ok: false as const, message: "Not found or no changes." },
          { status: 404 }
        ),
        guard.sessionResponse
      );
    }
    return withSessionCookies(
      NextResponse.json({ ok: true as const, entry: updated }),
      guard.sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update inspection.";
    return withSessionCookies(
      NextResponse.json({ ok: false as const, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
