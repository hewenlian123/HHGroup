import { sessionJson } from "@/lib/supabase-response";
import type { MaterialSelectionItemStatus } from "@/lib/material-selection-sheets";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { addMaterialSelectionItem } from "@/lib/material-selection-sheets-db";

function nullableBodyValue(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function itemStatus(value: unknown): MaterialSelectionItemStatus {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "approved" || raw === "installed") return raw;
  return "selected";
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  const json = (body: unknown, options?: { status?: number }) =>
    sessionJson(body, guard.sessionResponse, options?.status);

  const supabase = guard.client;

  const { id } = await ctx.params;
  if (!id?.trim()) {
    return json({ ok: false as const, message: "Missing selection id." }, { status: 400 });
  }

  try {
    const record = await supabase
      .from("material_selections")
      .select("organization_id")
      .eq("id", id)
      .maybeSingle();
    if (record.error)
      return json(
        { ok: false, message: "Material selection access is unavailable." },
        { status: 503 }
      );
    if (!record.data)
      return json({ ok: false, message: "Material selection not found." }, { status: 404 });
    const organizationId = record.data.organization_id;
    if (
      !guard.context.memberships.some(
        (member) => member.organization_id === organizationId && member.role !== "assistant"
      )
    )
      return json(
        { ok: false, message: "Organization administrator access required." },
        { status: 403 }
      );
    const body = (await req.json()) as Record<string, unknown>;
    const item = await addMaterialSelectionItem(
      id,
      {
        areaName: nullableBodyValue(body, "areaName"),
        category: nullableBodyValue(body, "category"),
        itemName: String(body.itemName ?? "").trim(),
        brand: nullableBodyValue(body, "brand"),
        sku: nullableBodyValue(body, "sku"),
        size: nullableBodyValue(body, "size"),
        color: nullableBodyValue(body, "color"),
        finish: nullableBodyValue(body, "finish"),
        imageUrl: nullableBodyValue(body, "imageUrl"),
        notes: nullableBodyValue(body, "notes"),
        status: itemStatus(body.status),
      },
      supabase
    );
    return json({ ok: true as const, item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add material item.";
    return json({ ok: false as const, message }, { status: 500 });
  }
}
