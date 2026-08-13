import { NextResponse } from "next/server";
import type { MaterialSelectionItemStatus } from "@/lib/material-selection-sheets";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { addMaterialSelectionItem } from "@/lib/material-selection-sheets-db";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

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
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false as const, message: "Supabase privileged server client is not configured." },
      { status: 503 }
    );
  }

  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json(
      { ok: false as const, message: "Missing selection id." },
      { status: 400 }
    );
  }

  try {
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
    return NextResponse.json({ ok: true as const, item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add material item.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
