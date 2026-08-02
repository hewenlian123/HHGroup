import { NextResponse } from "next/server";
import { upsertCloseoutWarranty } from "@/lib/data";
import {
  authorizeProjectCloseoutMutation,
  closeoutMutationFailure,
  type WarrantyMutationBody,
} from "@/lib/project-closeout-security";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const authorization = await authorizeProjectCloseoutMutation({
    kind: "warranty",
    projectId: id,
    request: req,
  });
  if (!authorization.ok) return authorization.response;

  const { admin, body, projectId } = authorization.context;
  try {
    await upsertCloseoutWarranty(projectId, body as WarrantyMutationBody, admin);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return closeoutMutationFailure("warranty", error);
  }
}
