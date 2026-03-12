"use server";

import { supabase } from "@/lib/supabase";
import { deleteSubcontractor, updateSubcontractor } from "@/lib/data";

const BUCKET = "attachments";
const W9_PREFIX = "w9/subcontractors";

export async function uploadW9(subcontractorId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file?.size || !supabase) return { ok: false, error: "No file or Supabase not configured." };
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${W9_PREFIX}/${subcontractorId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (uploadError) return { ok: false, error: uploadError.message };
  const updated = await updateSubcontractor(subcontractorId, { w9_storage_path: path });
  if (!updated) return { ok: false, error: "Failed to save path." };
  return { ok: true };
}

export async function removeW9(subcontractorId: string, storagePath: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (storageError) return { ok: false, error: storageError.message };
  await updateSubcontractor(subcontractorId, { w9_storage_path: null });
  return { ok: true };
}

export async function getW9SignedUrl(storagePath: string): Promise<{ url: string | null; error?: string }> {
  if (!supabase) return { url: null, error: "Supabase not configured." };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null };
}

export async function updateSubcontractorProfile(
  subcontractorId: string,
  patch: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    insurance_expiration_date?: string | null;
    notes?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!subcontractorId) return { ok: false, error: "Missing subcontractor id." };
    if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "Name is required." };
    await updateSubcontractor(subcontractorId, patch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update subcontractor." };
  }
}

export async function deleteSubcontractorAction(subcontractorId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!subcontractorId) return { ok: false, error: "Missing subcontractor id." };
    await deleteSubcontractor(subcontractorId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete subcontractor." };
  }
}
