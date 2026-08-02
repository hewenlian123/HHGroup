import { NextResponse } from "next/server";
import { upsertCloseoutCompletion } from "@/lib/data";
import {
  authorizeProjectCloseoutMutation,
  closeoutMutationFailure,
  type CompletionMutationBody,
} from "@/lib/project-closeout-security";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const authorization = await authorizeProjectCloseoutMutation({
    kind: "completion",
    projectId: id,
    request: req,
  });
  if (!authorization.ok) return authorization.response;

  const { admin, body, projectId } = authorization.context;
  try {
    await upsertCloseoutCompletion(projectId, body as CompletionMutationBody, admin);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return closeoutMutationFailure("completion", error);
  }
}
