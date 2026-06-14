import type { SupabaseClient } from "@supabase/supabase-js";

export const MATERIAL_IMAGES_BUCKET = "material-images";

const MATERIAL_IMAGE_FILE_SIZE_LIMIT = 10 * 1024 * 1024;
const MATERIAL_IMAGE_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function isMissingBucketMessage(message: string | undefined) {
  return /bucket not found|not found/i.test(message ?? "");
}

function isAlreadyExistsMessage(message: string | undefined) {
  return /already exists|duplicate/i.test(message ?? "");
}

export async function ensureMaterialImagesBucket(supabase: SupabaseClient) {
  const { data, error } = await supabase.storage.getBucket(MATERIAL_IMAGES_BUCKET);
  if (data && !error) return;
  if (error && !isMissingBucketMessage(error.message)) {
    throw new Error(error.message);
  }

  const { error: createError } = await supabase.storage.createBucket(MATERIAL_IMAGES_BUCKET, {
    public: false,
    fileSizeLimit: MATERIAL_IMAGE_FILE_SIZE_LIMIT,
    allowedMimeTypes: MATERIAL_IMAGE_ALLOWED_MIME_TYPES,
  });
  if (createError && !isAlreadyExistsMessage(createError.message)) {
    throw new Error(createError.message);
  }
}
