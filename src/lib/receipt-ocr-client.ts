/**
 * Shared client-side receipt OCR: OpenAI via /api/ocr-receipt, then tesseract.js fallback.
 * Used by Quick Expense and Worker Receipt Upload.
 */

export type ReceiptOcrResult = {
  vendor_name: string;
  total_amount: number;
  /** Parsed sales/use tax when visible. Display/debug only; not persisted to expense totals. */
  tax_amount?: number;
  purchase_date: string;
  items?: Array<{ name?: string; amount?: number }>;
  ocr_status?: "ok" | "fallback";
  ocr_reason?: string;
  raw_text?: string;
  /** e.g. cash, card, debit — when model / heuristics infer from receipt */
  payment_method?: string;
  confidence?: {
    vendor?: "high" | "medium" | "low";
    amount?: "high" | "medium" | "low";
    date?: "high" | "medium" | "low";
  };
};

export type FieldConfidence = "high" | "medium" | "low";
export type OcrSource = "cloud" | "local" | "manual" | "none";
export type AmountRuleDiagnostic = {
  kind: "accepted" | "rejected" | "meta";
  value?: string;
  reason: string;
  line?: string;
};

const OCR_MAX_EDGE = 1800;
const OCR_JPEG_QUALITY = 0.88;

function minFieldConfidence(a: FieldConfidence, b?: FieldConfidence): FieldConfidence {
  const rank: Record<FieldConfidence, number> = { low: 0, medium: 1, high: 2 };
  if (!b) return a;
  return rank[a] <= rank[b] ? a : b;
}

export function sanitizeNumericAmount(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 9_999_999) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded >= 1900 && rounded <= 2100 && Number.isInteger(rounded)) return null;
  return rounded;
}

export function clampPurchaseDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  if (y < 2000) return null;
  const today = new Date();
  const endToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
    999
  );
  if (dt > endToday) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function titleCase(v: string): string {
  return (v || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function dedupeItems(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const item = titleCase(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mapItemCategory(text: string): string[] {
  const t = text.toLowerCase();
  const hits: string[] = [];
  if (/\bpaint\b|\bprimer\b/.test(t)) hits.push("Paint");
  if (/\blumber\b|\bwood\b|\b2x4\b/.test(t)) hits.push("Lumber");
  if (/\bconcrete\b|\bcement\b/.test(t)) hits.push("Concrete");
  if (/\bpipe\b|\bpvc\b/.test(t)) hits.push("Plumbing");
  if (/\bwire\b|\bbreaker\b|\boutlet\b/.test(t)) hits.push("Electrical");
  return dedupeItems(hits);
}

async function readExifOrientation(file: File): Promise<number> {
  if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return 1;
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 12 || view.getUint16(0, false) !== 0xffd8) return 1;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2, false);
      if (size < 2) break;
      if (marker === 0xe1 && offset + 4 + size <= view.byteLength) {
        const exifStart = offset + 4;
        const exifHeader = String.fromCharCode(
          view.getUint8(exifStart),
          view.getUint8(exifStart + 1),
          view.getUint8(exifStart + 2),
          view.getUint8(exifStart + 3)
        );
        if (exifHeader !== "Exif") break;
        const tiff = exifStart + 6;
        const endian = view.getUint16(tiff, false);
        const little = endian === 0x4949;
        if (!little && endian !== 0x4d4d) return 1;
        const firstIfdOffset = view.getUint32(tiff + 4, little);
        const ifd = tiff + firstIfdOffset;
        if (ifd + 2 > view.byteLength) return 1;
        const entries = view.getUint16(ifd, little);
        for (let i = 0; i < entries; i += 1) {
          const entry = ifd + 2 + i * 12;
          if (entry + 12 > view.byteLength) break;
          const tag = view.getUint16(entry, little);
          if (tag === 0x0112) {
            const orientation = view.getUint16(entry + 8, little);
            return orientation >= 1 && orientation <= 8 ? orientation : 1;
          }
        }
      }
      offset += 2 + size;
    }
  } catch {
    return 1;
  }
  return 1;
}

function orientationSwapsDimensions(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

function drawBitmapWithOrientation(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  orientation: number,
  width: number,
  height: number
) {
  const drawW = orientationSwapsDimensions(orientation) ? height : width;
  const drawH = orientationSwapsDimensions(orientation) ? width : height;

  switch (orientation) {
    case 2:
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5:
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6:
      ctx.translate(width, 0);
      ctx.rotate(0.5 * Math.PI);
      break;
    case 7:
      ctx.translate(width, height);
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(-1, 1);
      break;
    case 8:
      ctx.translate(0, height);
      ctx.rotate(-0.5 * Math.PI);
      break;
    default:
      break;
  }

  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, drawW, drawH);
}

function percentileFromHistogram(hist: Uint32Array, total: number, percentile: number): number {
  const target = Math.max(0, Math.min(total - 1, Math.floor(total * percentile)));
  let seen = 0;
  for (let i = 0; i < hist.length; i += 1) {
    seen += hist[i] ?? 0;
    if (seen >= target) return i;
  }
  return 255;
}

function enhanceCanvasForOcr(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  const totalPixels = width * height;
  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(totalPixels);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const lum = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    gray[p] = lum;
    hist[lum] += 1;
  }

  const low = percentileFromHistogram(hist, totalPixels, 0.01);
  const high = percentileFromHistogram(hist, totalPixels, 0.99);
  const spread = Math.max(32, high - low);
  const normalized = new Uint8ClampedArray(totalPixels);

  for (let p = 0, i = 0; p < totalPixels; p += 1, i += 4) {
    const stretched = ((gray[p] - low) / spread) * 255;
    const contrasted = (stretched - 128) * 1.12 + 136;
    const value = Math.max(0, Math.min(255, Math.round(contrasted)));
    normalized[p] = value;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  if (totalPixels <= 4_000_000 && width > 2 && height > 2) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        const sharpened =
          normalized[idx] * 5 -
          normalized[idx - 1] -
          normalized[idx + 1] -
          normalized[idx - width] -
          normalized[idx + width];
        const value = Math.max(0, Math.min(255, Math.round(sharpened)));
        const di = idx * 4;
        data[di] = value;
        data[di + 1] = value;
        data[di + 2] = value;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
}

async function bitmapFromFileWithoutAutoOrientation(file: File): Promise<{
  bitmap: ImageBitmap;
  manualOrientationSafe: boolean;
}> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "none",
    } as ImageBitmapOptions);
    return { bitmap, manualOrientationSafe: true };
  } catch {
    const bitmap = await createImageBitmap(file);
    return { bitmap, manualOrientationSafe: false };
  }
}

export async function prepareImageFileForReceiptOcr(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  let bitmap: ImageBitmap | null = null;
  try {
    const orientation = await readExifOrientation(file);
    const loaded = await bitmapFromFileWithoutAutoOrientation(file);
    bitmap = loaded.bitmap;
    const safeOrientation = loaded.manualOrientationSafe ? orientation : 1;
    const rawW = bitmap.width;
    const rawH = bitmap.height;
    const orientedW = orientationSwapsDimensions(safeOrientation) ? rawH : rawW;
    const orientedH = orientationSwapsDimensions(safeOrientation) ? rawW : rawH;
    const scale = Math.min(1, OCR_MAX_EDGE / Math.max(orientedW, orientedH));
    const width = Math.max(1, Math.round(orientedW * scale));
    const height = Math.max(1, Math.round(orientedH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawBitmapWithOrientation(ctx, bitmap, safeOrientation, width, height);
    enhanceCanvasForOcr(ctx, width, height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", OCR_JPEG_QUALITY)
    );
    if (!blob || blob.size === 0) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "receipt";
    return new File([blob], `${baseName}-ocr.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to load image for OCR"));
      el.src = objectUrl;
    });
    const maxWidth = 1400;
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create OCR canvas context");
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function isSubtotalOrTaxLine(line: string): boolean {
  return /\b(subtotal|sub-total|tax\s*:|sales\s*tax|vat|gst)\b/i.test(line);
}

function isNonFinalAmountLine(line: string): boolean {
  return /\b(total\s+savings?|you\s+saved|discount|coupon|rebate|change\s+due|cash\s+back|tendered|auth(?:orization)?|approval|total\s+items?|items\s+sold|quantity|qty)\b/i.test(
    line
  );
}

function parseMoneyCandidates(line: string): Array<{ raw: string; amount: number }> {
  const matches = line.match(/\$?\s*\d{1,4}(?:,\d{3})*(?:\.\d{2,3})?/g) ?? [];
  const out: Array<{ raw: string; amount: number }> = [];
  for (const raw of matches) {
    const normalized = raw.replace(/[$,\s]/g, "");
    const n = Number(normalized);
    const isYearLike = /^\d{4}$/.test(normalized) && n >= 1900 && n <= 2100;
    if (isYearLike) continue;
    const hasDollar = raw.includes("$");
    const hasDecimal = normalized.includes(".");
    // OCR often emits IDs as 4-digit integers in amount-ish lines.
    if (!hasDollar && !hasDecimal && n >= 1000) continue;
    if (Number.isFinite(n) && n > 0) out.push({ raw: raw.trim(), amount: n });
  }
  return out;
}

function pickLikelyAmount(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let best = 0;
  for (const line of lines) {
    if (isSubtotalOrTaxLine(line)) continue;
    if (isNonFinalAmountLine(line)) continue;
    const parsed = parseMoneyCandidates(line).map((c) => c.amount);
    if (parsed.length === 0) continue;
    const lineBest = Math.max(...parsed);
    if (
      /\b(total|amount\s+due|balance\s+due|grand\s+total|amount\s+paid|fuel\s+total)\b/i.test(line)
    ) {
      return lineBest;
    }
    if (lineBest > best) best = lineBest;
  }
  return best;
}

export function parseTaxAmountFromText(text: string): number | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!/\b(sales\s*tax|tax|ge\s*tax|g\.?e\.?t\.?|vat|gst)\b/i.test(line)) continue;
    if (/\bsubtotal|total\b/i.test(line) && !/\btax\b/i.test(line)) continue;
    const candidates = parseMoneyCandidates(line);
    if (!candidates.length) continue;
    const currencyCandidate = [...candidates].reverse().find((c) => c.raw.includes("$"));
    const selected = currencyCandidate ?? candidates[candidates.length - 1]!;
    const tax = sanitizeNumericAmount(selected.amount);
    if (tax != null) return tax;
  }
  return null;
}

export function parseDateFromTextDetailed(text: string): {
  iso: string | null;
  confidence: FieldConfidence;
} {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const labeled = lines.find((line) =>
    /\b(date|purchase|purchased|sale|transaction|invoice)\b/i.test(line)
  );
  const hay = labeled || text;
  const m1 = hay.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m1) {
    const y = m1[1];
    const mo = m1[2].padStart(2, "0");
    const d = m1[3].padStart(2, "0");
    return { iso: `${y}-${mo}-${d}`, confidence: labeled ? "high" : "medium" };
  }
  const m2 = hay.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (m2) {
    const a = Number(m2[1]);
    const b = Number(m2[2]);
    const y = m2[3];
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    return {
      iso: `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      confidence: labeled ? "high" : "medium",
    };
  }
  // M/D/YY or MM-DD-YY (2-digit year)
  const m3 = hay.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b/);
  if (m3) {
    let y = Number(m3[3]);
    y += y >= 70 ? 1900 : 2000;
    const a = Number(m3[1]);
    const b = Number(m3[2]);
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        iso: `${String(y)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        confidence: labeled ? "high" : "medium",
      };
    }
  }
  return { iso: null, confidence: "low" };
}

export function parseDateFromText(text: string): string | null {
  return parseDateFromTextDetailed(text).iso;
}

function pickLikelyVendor(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);
  for (const line of lines) {
    if (line.length < 2 || line.length > 40) continue;
    if (/\d{2,}/.test(line)) continue;
    if (/\b(receipt|invoice|total|tax|date|cash|card|visa|mastercard)\b/i.test(line)) continue;
    return line;
  }
  return "Unknown";
}

export function sanitizeVendorCandidate(v: string): string {
  const t = (v ?? "").trim();
  if (!t) return "Needs Review";
  if (t.length < 3) return "Needs Review";
  if (!/[A-Za-z\u4e00-\u9fff]/.test(t)) return "Needs Review";
  const alphaCount = (t.match(/[A-Za-z\u4e00-\u9fff]/g) ?? []).length;
  if (alphaCount / t.length < 0.6) return "Needs Review";
  if (/^[^A-Za-z0-9\u4e00-\u9fff]{1,8}$/.test(t)) return "Needs Review";
  return t;
}

function normalizeVendor(v: string): string {
  return (v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectKnownVendor(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("home depot")) return "Home Depot";
  if (/\blowe'?s?\b/.test(t) || t.includes("lowes")) return "Lowe's";
  if (t.includes("walmart")) return "Walmart";
  if (t.includes("costco")) return "Costco";
  if (t.includes("city mill")) return "City Mill";
  if (t.includes("hardware hawaii")) return "Hardware Hawaii";
  if (
    /\b(shell|chevron|exxon|mobil|bp|76 gas|texaco|sunoco|fuel|gas\s+station|gasoline)\b/i.test(t)
  ) {
    return "Gas station";
  }
  return null;
}

function parseVendorSpecificAmount(text: string, vendor: string): number {
  const lines = text.split(/\r?\n/);
  const candidates: number[] = [];
  const bigRetail =
    vendor === "Home Depot" ||
    vendor === "Lowe's" ||
    vendor === "Walmart" ||
    vendor === "Costco" ||
    vendor === "City Mill" ||
    vendor === "Hardware Hawaii";
  const rules = bigRetail
    ? [/\bgrand\s+total\b/i, /\btotal\b/i, /\bbalance\s+due\b/i, /\bamount\s+paid\b/i]
    : vendor === "Gas station"
      ? [/\bfuel\s+total\b/i, /\btotal\b/i, /\bamount\s+paid\b/i]
      : [/\btotal\b/i, /\bbalance\s+due\b/i, /\bamount\s+paid\b/i];
  for (const line of lines) {
    if (isSubtotalOrTaxLine(line)) continue;
    if (/\bsubtotal\b/i.test(line)) continue;
    if (isNonFinalAmountLine(line)) continue;
    if (!rules.some((r) => r.test(line))) continue;
    candidates.push(...parseMoneyCandidates(line).map((c) => c.amount));
  }
  return candidates.length ? Math.max(...candidates) : 0;
}

/** Infer card/cash from receipt text (payment account matching is done in UI). */
export function inferPaymentMethodFromText(text: string): string | null {
  const t = (text ?? "").toLowerCase();
  if (/\bcash\b|\bcurrency\b/i.test(t) && !/\bcredit\b/.test(t)) return "cash";
  if (/\bvisa\b/.test(t)) return "visa";
  if (/\bmastercard\b|\bmaster\s*card\b|\bmc\b/.test(t)) return "card";
  if (/\bamex\b|\bamerican\s*express\b/.test(t)) return "card";
  if (/\bdebit\b|\bcredit\b|\bchip\b|\btap\b/.test(t)) return "card";
  return null;
}

export function parseAmountProduction(
  text: string,
  vendor: string
): {
  amount: number;
  confidence: FieldConfidence;
  matchedRules: string[];
  diagnostics: AmountRuleDiagnostic[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const matchedRules: string[] = [];
  const diagnostics: AmountRuleDiagnostic[] = [];
  const labelRules = [
    { name: "amount-due", score: 100, pattern: /\b(amount\s+due|balance\s+due|total\s+due)\b/i },
    { name: "grand-total", score: 96, pattern: /\bgrand\s+total\b/i },
    { name: "fuel-total", score: 94, pattern: /\bfuel\s+total\b/i },
    { name: "final-total", score: 90, pattern: /\b(total|order\s+total|sale\s+total)\b/i },
    { name: "amount-paid", score: 82, pattern: /\bamount\s+paid\b/i },
  ];
  const labeled: Array<{ amount: number; score: number; line: string; rule: string; raw: string }> =
    [];
  for (const line of lines) {
    if (isSubtotalOrTaxLine(line) || /\bsubtotal\b/i.test(line)) {
      diagnostics.push({ kind: "rejected", reason: "subtotal/tax label", line });
      continue;
    }
    if (isNonFinalAmountLine(line)) {
      diagnostics.push({ kind: "rejected", reason: "non-final amount label", line });
      continue;
    }
    const rule = labelRules.find((r) => r.pattern.test(line));
    if (!rule) continue;
    matchedRules.push(`label:${rule.name}:${line}`);
    const candidates = parseMoneyCandidates(line);
    if (!candidates.length) {
      diagnostics.push({ kind: "rejected", reason: "label without usable money", line });
      continue;
    }
    const selected = candidates[candidates.length - 1]!;
    labeled.push({
      amount: selected.amount,
      score: rule.score,
      line,
      rule: rule.name,
      raw: selected.raw,
    });
    diagnostics.push({
      kind: "accepted",
      value: selected.raw,
      reason: `strict label match: ${rule.name}`,
      line,
    });
    for (const skipped of candidates.slice(0, -1)) {
      diagnostics.push({
        kind: "rejected",
        value: skipped.raw,
        reason: "earlier value on selected amount line",
        line,
      });
    }
  }
  const vendorSpecific = parseVendorSpecificAmount(text, vendor);
  if (vendorSpecific > 0) {
    matchedRules.push(`vendor-specific:${vendor}`);
    diagnostics.push({
      kind: "meta",
      reason: `vendor-specific rule matched: ${vendor}`,
    });
  }
  const labeledBest = labeled.length
    ? [...labeled].sort((a, b) => b.score - a.score || b.amount - a.amount)[0]!.amount
    : 0;
  if (Math.max(labeledBest, vendorSpecific) > 0) {
    diagnostics.push({
      kind: "meta",
      reason: `selected amount: ${Math.max(labeledBest, vendorSpecific)}`,
    });
    return {
      amount: Math.max(labeledBest, vendorSpecific),
      confidence: "high",
      matchedRules: matchedRules.length ? matchedRules : ["regex:strict"],
      diagnostics,
    };
  }
  const generic = pickLikelyAmount(text);
  if (generic > 0) {
    diagnostics.push({
      kind: "meta",
      reason: `fallback largest-number selected: ${generic}`,
    });
    return {
      amount: generic,
      confidence: "medium",
      matchedRules: ["fallback:largest"],
      diagnostics,
    };
  }
  diagnostics.push({ kind: "meta", reason: "no amount candidate found" });
  return { amount: 0, confidence: "low", matchedRules: ["fallback:none"], diagnostics };
}

async function runLocalBrowserOcr(file: File): Promise<ReceiptOcrResult | null> {
  try {
    const { createWorker } = await import("tesseract.js");
    const dataUrl = await fileToDataUrl(file);
    const worker = await createWorker("eng", 1, {
      logger: () => {},
    });
    const result = await worker.recognize(dataUrl);
    await worker.terminate();
    const text = result?.data?.text ?? "";
    if (!text.trim()) return null;
    const known = detectKnownVendor(text);
    const parsedAmount = parseAmountProduction(text, known ?? pickLikelyVendor(text));
    const parsedDate = parseDateFromTextDetailed(text);
    const today = new Date().toISOString().slice(0, 10);
    return {
      vendor_name: known ?? pickLikelyVendor(text),
      total_amount: parsedAmount.amount,
      tax_amount: parseTaxAmountFromText(text) ?? undefined,
      purchase_date: clampPurchaseDate(parsedDate.iso ?? "") ?? today,
      items: [],
      ocr_status: "ok",
      ocr_reason: "local_browser_ocr",
      raw_text: text,
      confidence: {
        vendor: known ? "high" : "medium",
        amount: parsedAmount.confidence,
        date: parsedDate.iso ? parsedDate.confidence : "low",
      },
    };
  } catch {
    return null;
  }
}

async function runLocalBrowserOcrWithTimeout(
  file: File,
  timeoutMs = 8000
): Promise<ReceiptOcrResult | null> {
  return await Promise.race([
    runLocalBrowserOcr(file),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

/** Cloud API + optional local tesseract fallback for one image file. */
export async function runReceiptOcrForImageFile(
  file: File,
  options?: { localTimeoutMs?: number }
): Promise<{ result: ReceiptOcrResult; source: OcrSource }> {
  const ocrFile = await prepareImageFileForReceiptOcr(file);
  let ocr: ReceiptOcrResult = {
    vendor_name: "Unknown",
    total_amount: 0,
    purchase_date: new Date().toISOString().slice(0, 10),
  };
  let source: OcrSource = "cloud";
  try {
    const form = new FormData();
    form.append("file", ocrFile);
    if (ocrFile !== file) form.append("ocr_preprocessed", "1");
    const res = await fetch("/api/ocr-receipt", { method: "POST", body: form });
    if (res.ok) ocr = await res.json();
    else source = "manual";
  } catch {
    source = "manual";
  }
  const cloudFailed =
    ocr.ocr_status === "fallback" ||
    ((ocr.vendor_name || "Unknown") === "Unknown" && (Number(ocr.total_amount) || 0) <= 0);
  if (cloudFailed) {
    const local = await runLocalBrowserOcrWithTimeout(ocrFile, options?.localTimeoutMs ?? 8000);
    if (local) {
      ocr = local;
      source = "local";
    } else {
      source = "manual";
    }
  }
  return { result: ocr, source };
}

export type MergedReceiptOcr = {
  mergedText: string;
  ocrResults: Array<{ result: ReceiptOcrResult; source: OcrSource }>;
  finalVendor: string;
  sanitizedAmount: number | null;
  clampedPurchase: string | null;
  finalDateSuggestion: string;
  detectedTaxAmount: number | null;
  todayStr: string;
  vendorConfidence: FieldConfidence;
  amountConfidence: FieldConfidence;
  dateConfidence: FieldConfidence;
  autoFillVendor: boolean;
  autoFillAmount: boolean;
  autoFillDate: boolean;
  /** True when any critical field is not high-confidence — caller should not overwrite user edits; prompt review. */
  needsReview: boolean;
  /** Hint for payment account picker (lowercase token). */
  suggestedPaymentMethod: string | null;
  finalItems: string[];
  mappedCategory: string;
  source: OcrSource;
  matchedRules: string[];
  amountDiagnostics: AmountRuleDiagnostic[];
  detectedSnapshot: { vendor: string; amount: number };
  ocrSuggestions: { vendor: string; amount: string; date: string };
};

/**
 * Merge one or more per-image OCR results into field suggestions (same rules as Quick Expense).
 */
export function mergeReceiptOcrResults(
  ocrResults: Array<{ result: ReceiptOcrResult; source: OcrSource }>,
  options: {
    learnStorageKey?: string;
    inferCategory: (vendor: string, itemNames: string[]) => string;
  }
): MergedReceiptOcr {
  const mergedText = ocrResults.map((r) => r.result.raw_text ?? "").join("\n");
  const bestKnownVendor =
    detectKnownVendor(mergedText) ??
    ocrResults.find(
      (r) => (r.result.vendor_name ?? "").trim() && r.result.vendor_name !== "Unknown"
    )?.result.vendor_name ??
    pickLikelyVendor(mergedText);
  let finalVendor = sanitizeVendorCandidate(bestKnownVendor || "Unknown");
  const amountFromRules = parseAmountProduction(mergedText, finalVendor);
  const dateFromRules = parseDateFromTextDetailed(mergedText);
  const detectedTaxAmount =
    parseTaxAmountFromText(mergedText) ??
    ocrResults
      .map((r) => sanitizeNumericAmount(Number(r.result.tax_amount)))
      .find((n): n is number => n != null) ??
    null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const purchaseFromOcr =
    ocrResults.find((r) => r.result.purchase_date)?.result.purchase_date ?? "";
  const clampedPurchase =
    clampPurchaseDate((dateFromRules.iso ?? "").slice(0, 10)) ||
    clampPurchaseDate(purchaseFromOcr.slice(0, 10)) ||
    null;
  const finalDateSuggestion = clampedPurchase ?? todayStr;

  let hintBoostAmount: number | null = null;
  try {
    const raw = options.learnStorageKey
      ? window.localStorage.getItem(options.learnStorageKey)
      : null;
    if (raw) {
      const learned = JSON.parse(raw) as {
        vendorAliases?: Record<string, string>;
        amountHints?: Record<string, number>;
      };
      const key = normalizeVendor(finalVendor);
      const alias = learned.vendorAliases?.[key];
      if (alias) finalVendor = sanitizeVendorCandidate(alias);
      const hinted = Number(learned.amountHints?.[key] ?? 0);
      if (amountFromRules.amount <= 0 && hinted > 0) hintBoostAmount = hinted;
    }
  } catch {
    // ignore
  }

  let sanitizedAmount =
    sanitizeNumericAmount(amountFromRules.amount) ??
    (hintBoostAmount != null ? sanitizeNumericAmount(hintBoostAmount) : null);
  if (sanitizedAmount == null) {
    const apiCandidates = ocrResults
      .map((r) => sanitizeNumericAmount(Number(r.result.total_amount)))
      .filter((n): n is number => n != null);
    if (apiCandidates.length) sanitizedAmount = Math.max(...apiCandidates);
  }

  const source: OcrSource = ocrResults.some((r) => r.source === "local")
    ? "local"
    : ocrResults.every((r) => r.source === "cloud")
      ? "cloud"
      : "manual";

  const itemNames = ocrResults
    .flatMap((r) => (Array.isArray(r.result.items) ? r.result.items : []))
    .map((i) => i?.name ?? "");
  const fromRawRules = mapItemCategory(mergedText);
  const fromItemNames = itemNames.flatMap((n) => mapItemCategory(n));
  const initialItems = dedupeItems([...fromRawRules, ...fromItemNames]);
  const finalItems = initialItems.length ? initialItems : ["Materials"];
  const mappedCategory = options.inferCategory(finalVendor, itemNames);

  let vendorConfidence: FieldConfidence =
    finalVendor !== "Unknown" && finalVendor !== "Needs Review" ? "high" : "low";
  let amountConfidence = amountFromRules.confidence;
  let dateConfidence: FieldConfidence = clampedPurchase ? dateFromRules.confidence : "low";

  for (const r of ocrResults) {
    const oc = r.result.confidence;
    if (oc?.vendor) vendorConfidence = minFieldConfidence(vendorConfidence, oc.vendor);
    if (oc?.amount) amountConfidence = minFieldConfidence(amountConfidence, oc.amount);
    if (oc?.date && dateConfidence !== "low") {
      dateConfidence = minFieldConfidence(dateConfidence, oc.date);
    }
  }
  if (clampedPurchase && dateConfidence === "low") {
    dateConfidence = "medium";
  }

  const autoFillVendor =
    vendorConfidence === "high" && finalVendor !== "Needs Review" && finalVendor !== "Unknown";
  const autoFillAmount = amountConfidence === "high" && sanitizedAmount != null;
  /** Only autofill date when date confidence is high (avoid wrong dates from noisy OCR). */
  const autoFillDate = dateConfidence === "high" && clampedPurchase != null;

  const apiPayment = ocrResults
    .map((r) => (r.result.payment_method ?? "").trim())
    .find((s) => s.length > 0);
  const suggestedPaymentMethod =
    (apiPayment ? apiPayment.toLowerCase() : null) ?? inferPaymentMethodFromText(mergedText);

  const needsReview =
    vendorConfidence !== "high" || amountConfidence !== "high" || dateConfidence !== "high";

  return {
    mergedText,
    ocrResults,
    finalVendor,
    sanitizedAmount,
    clampedPurchase,
    finalDateSuggestion,
    detectedTaxAmount,
    todayStr,
    vendorConfidence,
    amountConfidence,
    dateConfidence,
    autoFillVendor,
    autoFillAmount,
    autoFillDate,
    needsReview,
    suggestedPaymentMethod,
    finalItems,
    mappedCategory,
    source,
    matchedRules: amountFromRules.matchedRules,
    amountDiagnostics: amountFromRules.diagnostics,
    detectedSnapshot: {
      vendor: finalVendor,
      amount: sanitizedAmount ?? hintBoostAmount ?? 0,
    },
    ocrSuggestions: {
      vendor: finalVendor,
      amount: sanitizedAmount != null ? String(sanitizedAmount) : "",
      date: finalDateSuggestion,
    },
  };
}
