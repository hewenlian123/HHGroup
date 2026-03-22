import { NextResponse } from "next/server";
import { getMaterialCatalog, createMaterial, updateMaterial } from "@/lib/data";

export async function GET() {
  try {
    const materials = await getMaterialCatalog();
    return NextResponse.json({ ok: true as const, materials });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load material catalog.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const material = await createMaterial({
      category: String(body.category ?? "").trim(),
      material_name: String(body.material_name ?? "").trim(),
      supplier: body.supplier ?? null,
      cost: body.cost != null ? Number(body.cost) : null,
      photo_url: body.photo_url ?? null,
      description: body.description ?? null,
    });
    return NextResponse.json({ ok: true as const, material });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create material.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false as const, message: "Material id is required." },
        { status: 400 }
      );
    }
    const material_name = String(body.material_name ?? "").trim();
    if (!material_name) {
      return NextResponse.json(
        { ok: false as const, message: "Material name is required." },
        { status: 400 }
      );
    }
    const updated = await updateMaterial(id, {
      category: String(body.category ?? "").trim() || "Uncategorized",
      material_name,
      supplier:
        body.supplier != null && String(body.supplier).trim() !== ""
          ? String(body.supplier).trim()
          : null,
      cost:
        body.cost !== "" && body.cost != null && Number.isFinite(Number(body.cost))
          ? Number(body.cost)
          : null,
      photo_url:
        body.photo_url != null && String(body.photo_url).trim() !== ""
          ? String(body.photo_url).trim()
          : null,
      description:
        body.description != null && String(body.description).trim() !== ""
          ? String(body.description).trim()
          : null,
    });
    if (!updated) {
      return NextResponse.json(
        { ok: false as const, message: "Failed to update material." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true as const, material: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update material.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
