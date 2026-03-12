import { NextResponse } from "next/server";
import { getMaterialCatalog, createMaterial } from "@/lib/data";

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
