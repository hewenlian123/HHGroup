import { sessionJson } from "@/lib/supabase-response";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import {
  getSelectionsByProject,
  createSelection,
  updateSelection,
  type MaterialSelectionStatus,
} from "@/lib/material-selections-db";
import { getMaterialCatalog } from "@/lib/material-catalog-db";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireOrganizationRequestClient(req, { projectId: id, noStore: true });
  if (!guard.ok) return guard.response;
  try {
    const [selections, catalog] = await Promise.all([
      getSelectionsByProject(id, guard.client),
      getMaterialCatalog(guard.client, guard.context.organizationId ?? undefined),
    ]);
    return sessionJson({ ok: true, selections, catalog }, guard.sessionResponse);
  } catch (error) {
    return sessionJson(
      { ok: false, message: error instanceof Error ? error.message : "Materials are unavailable." },
      guard.sessionResponse,
      500
    );
  }
}

async function save(req: Request, ctx: { params: Promise<{ id: string }> }, update: boolean) {
  const { id: projectId } = await ctx.params;
  const guard = await requireOrganizationRequestClient(req, {
    projectId,
    write: true,
    noStore: true,
  });
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json();
    const item = String(body.item ?? "").trim();
    const status = body.status ?? "Pending";
    const selectionId = String(body.id ?? "").trim();
    if (!item || !["Selected", "Pending", "Ordered"].includes(status) || (update && !selectionId)) {
      return sessionJson(
        { ok: false, message: "A material item and valid status are required." },
        guard.sessionResponse,
        400
      );
    }
    const draft = {
      project_id: projectId,
      item,
      category: String(body.category ?? "").trim(),
      material_id: body.material_id || null,
      material_name: String(body.material_name ?? "").trim(),
      supplier: body.supplier ?? null,
      status: status as MaterialSelectionStatus,
      notes: body.notes ?? null,
    };
    const selection = update
      ? await updateSelection(selectionId, draft, guard.client, projectId)
      : await createSelection(draft, guard.client);
    if (!selection) throw new Error("Selection was not saved.");
    return sessionJson({ ok: true, selection }, guard.sessionResponse);
  } catch (error) {
    return sessionJson(
      { ok: false, message: error instanceof Error ? error.message : "Selection was not saved." },
      guard.sessionResponse,
      500
    );
  }
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return save(req, ctx, false);
}
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return save(req, ctx, true);
}
