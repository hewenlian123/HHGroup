import { NextResponse } from "next/server";
import { upsertCloseoutCompletion } from "@/lib/data";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import {
  getServerSupabaseAdmin,
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE,
} from "@/lib/supabase-server";
import { parseCloseoutCompletionInput } from "@/lib/project-closeout-validation";

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!id)
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 }),
      guard.sessionResponse
    );
  const admin = getServerSupabaseAdmin();
  if (!admin)
    return withSessionCookies(
      NextResponse.json(
        { ok: false, message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
        { status: 503 }
      ),
      guard.sessionResponse
    );
  let input: ReturnType<typeof parseCloseoutCompletionInput>;
  try {
    input = parseCloseoutCompletionInput(await req.json());
  } catch {
    input = { ok: false, message: "Invalid closeout input." };
  }
  if (!input.ok) {
    return withSessionCookies(
      NextResponse.json({ ok: false, message: input.message }, { status: 400 }),
      guard.sessionResponse
    );
  }
  try {
    await upsertCloseoutCompletion(id, input.value, admin);
    return withSessionCookies(NextResponse.json({ ok: true }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
