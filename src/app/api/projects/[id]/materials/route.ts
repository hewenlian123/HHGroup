import { NextResponse } from "next/server";
import { getSelectionsByProject, getMaterialCatalog, createMaterialSelection } from "@/lib/data";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim())
    return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const [selections, catalog] = await Promise.all([
      getSelectionsByProject(id),
      getMaterialCatalog(),
    ]);
    return NextResponse.json({ ok: true as const, selections, catalog });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load materials.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  if (!projectId?.trim())
    return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const body = await req.json();
    const selection = await createMaterialSelection({
      project_id: projectId,
      item: String(body.item ?? "").trim(),
      category: String(body.category ?? "").trim(),
      material_id: body.material_id ?? null,
      material_name: String(body.material_name ?? "").trim(),
      supplier: body.supplier ?? null,
      status: body.status ?? "Pending",
      notes: body.notes ?? null,
    });
    return NextResponse.json({ ok: true as const, selection });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create selection.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
