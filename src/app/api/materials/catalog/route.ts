import { sessionJson } from "@/lib/supabase-response";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { getMaterialCatalog, createMaterial, updateMaterial } from "@/lib/material-catalog-db";

export async function GET(req: Request) {
  const guard = await requireOrganizationRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;
  const json = (body: unknown, options?: { status?: number }) =>
    sessionJson(body, guard.sessionResponse, options?.status);
  try {
    const materials = await getMaterialCatalog(guard.client);
    return json({ ok: true as const, materials });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load materials.";
    return json({ ok: false as const, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await requireOrganizationRequestClient(req, { write: true, noStore: true });
  if (!guard.ok) return guard.response;
  const json = (body: unknown, options?: { status?: number }) =>
    sessionJson(body, guard.sessionResponse, options?.status);
  try {
    const body = await req.json();
    const material = await createMaterial(
      {
        category: String(body.category ?? "").trim(),
        material_name: String(body.material_name ?? "").trim(),
        supplier: body.supplier ?? null,
        cost: body.cost != null ? Number(body.cost) : null,
        photo_url: body.photo_url ?? null,
        description: body.description ?? null,
      },
      guard.client
    );
    return json({ ok: true as const, material });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create material.";
    return json({ ok: false as const, message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const guard = await requireOrganizationRequestClient(req, { write: true, noStore: true });
  if (!guard.ok) return guard.response;
  const json = (body: unknown, options?: { status?: number }) =>
    sessionJson(body, guard.sessionResponse, options?.status);
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return json({ ok: false as const, message: "Material id is required." }, { status: 400 });
    }
    const material_name = String(body.material_name ?? "").trim();
    if (!material_name) {
      return json({ ok: false as const, message: "Material name is required." }, { status: 400 });
    }
    const updated = await updateMaterial(
      id,
      {
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
      },
      guard.client
    );
    if (!updated) {
      return json({ ok: false as const, message: "Failed to update material." }, { status: 500 });
    }
    return json({ ok: true as const, material: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update material.";
    return json({ ok: false as const, message }, { status: 500 });
  }
}
