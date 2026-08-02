import { NextResponse } from "next/server";
import { upsertCloseoutPunch } from "@/lib/data";
import {
  authorizeProjectCloseoutMutation,
  closeoutMutationFailure,
  type PunchMutationBody,
} from "@/lib/project-closeout-security";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const authorization = await authorizeProjectCloseoutMutation({
    kind: "punch",
    projectId: id,
    request: req,
  });
  if (!authorization.ok) return authorization.response;

  const { admin, body, projectId } = authorization.context;
  try {
    await upsertCloseoutPunch(projectId, body as PunchMutationBody, admin);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return closeoutMutationFailure("punch", error);
  }
}
