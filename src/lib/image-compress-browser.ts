/**
 * Client-side resize/compress for receipt photos before upload (PDFs unchanged).
 * Max edge 1800px, JPEG ~0.78 quality — balances size vs OCR readability.
 */

const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.78;

function needsCompression(file: File): boolean {
  if (!file.type.startsWith("image/")) return false;
  if (file.type === "image/svg+xml") return false;
  return true;
}

/**
 * Downscale image files for faster uploads; returns original file if not an image or on failure.
 */
export async function compressImageFileForReceiptUpload(file: File): Promise<File> {
  if (!needsCompression(file)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    // Yield one frame so “Preparing image…” can paint before canvas work (main-thread compress).
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const w = bitmap.width;
      const h = bitmap.height;
      const maxDim = Math.max(w, h);
      let tw = w;
      let th = h;
      if (maxDim > MAX_EDGE) {
        const scale = MAX_EDGE / maxDim;
        tw = Math.round(w * scale);
        th = Math.round(h * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, tw, th);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY)
      );
      if (!blob || blob.size === 0) return file;

      const baseName = file.name.replace(/\.[^.]+$/, "") || "receipt";
      const outName = `${baseName}.jpg`;
      return new File([blob], outName, { type: "image/jpeg", lastModified: Date.now() });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
