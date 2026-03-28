/**
 * Shared client-side receipt OCR: OpenAI via /api/ocr-receipt, then tesseract.js fallback.
 * Used by Quick Expense and Worker Receipt Upload.
 */

export type ReceiptOcrResult = {
  vendor_name: string;
  total_amount: number;
  purchase_date: string;
  items?: Array<{ name?: string; amount?: number }>;
  ocr_status?: "ok" | "fallback";
  ocr_reason?: string;
  raw_text?: string;
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

function pickLikelyAmount(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let best = 0;
  for (const line of lines) {
    const nums = line.match(/\$?\s*\d{1,4}(?:,\d{3})*(?:\.\d{2})?/g) ?? [];
    const parsed = nums
      .map((raw) => {
        const normalized = raw.replace(/[$,\s]/g, "");
        const n = Number(normalized);
        const isYearLike = /^\d{4}$/.test(normalized) && n >= 1900 && n <= 2100;
        return isYearLike ? 0 : n;
      })
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsed.length === 0) continue;
    const lineBest = Math.max(...parsed);
    if (/\b(total|amount due|balance due|grand total)\b/i.test(line)) {
      return lineBest;
    }
    if (lineBest > best) best = lineBest;
  }
  return best;
}

function parseDateFromText(text: string): string | null {
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
    return `${y}-${mo}-${d}`;
  }
  const m2 = hay.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (m2) {
    const a = Number(m2[1]);
    const b = Number(m2[2]);
    const y = m2[3];
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
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

function detectKnownVendor(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("home depot")) return "Home Depot";
  if (t.includes("lowe") || t.includes("lowe's")) return "Lowe's";
  if (t.includes("walmart")) return "Walmart";
  if (t.includes("costco")) return "Costco";
  return null;
}

function parseVendorSpecificAmount(text: string, vendor: string): number {
  const lines = text.split(/\r?\n/);
  const candidates: number[] = [];
  const rules =
    vendor === "Home Depot" || vendor === "Lowe's" || vendor === "Walmart" || vendor === "Costco"
      ? [/\btotal\b/i, /\bsubtotal\b/i, /\btax\b/i]
      : [/\bfuel total\b/i, /\btotal\b/i];
  for (const line of lines) {
    if (!rules.some((r) => r.test(line))) continue;
    const nums = line.match(/\$?\s*\d{1,4}(?:,\d{3})*(?:\.\d{2})?/g) ?? [];
    for (const raw of nums) {
      const normalized = raw.replace(/[$,\s]/g, "");
      const n = Number(normalized);
      const isYearLike = /^\d{4}$/.test(normalized) && n >= 1900 && n <= 2100;
      if (isYearLike) continue;
      const hasDollar = raw.includes("$");
      const hasDecimal = normalized.includes(".");
      if (!hasDollar && !hasDecimal && n >= 1000) continue;
      if (Number.isFinite(n) && n > 0) candidates.push(n);
    }
  }
  return candidates.length ? Math.max(...candidates) : 0;
}

function parseAmountProduction(
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
  const strictPatterns = [/\btotal\b/i, /\bamount\b/i, /\bbalance due\b/i, /\bfuel total\b/i];
  const labeled: number[] = [];
  for (const line of lines) {
    const hit = strictPatterns.some((p) => p.test(line));
    if (!hit) continue;
    matchedRules.push(`label:${line}`);
    const nums = line.match(/\$?\s*\d{1,4}(?:,\d{3})*(?:\.\d{2})?/g) ?? [];
    for (const raw of nums) {
      const normalized = raw.replace(/[$,\s]/g, "");
      const n = Number(normalized);
      const isYearLike = /^\d{4}$/.test(normalized) && n >= 1900 && n <= 2100;
      if (isYearLike) {
        diagnostics.push({ kind: "rejected", value: raw.trim(), reason: "year-like", line });
        continue;
      }
      const hasDollar = raw.includes("$");
      const hasDecimal = normalized.includes(".");
      // OCR often emits IDs as 4-digit integers in total lines (e.g. 9681).
      if (!hasDollar && !hasDecimal && n >= 1000) {
        diagnostics.push({
          kind: "rejected",
          value: raw.trim(),
          reason: "id-like integer without decimal/currency",
          line,
        });
        continue;
      }
      if (Number.isFinite(n) && n > 0) {
        labeled.push(n);
        diagnostics.push({
          kind: "accepted",
          value: raw.trim(),
          reason: "strict label match",
          line,
        });
      }
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
  const labeledBest = labeled.length ? Math.max(...labeled) : 0;
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
    const parsedDate = parseDateFromText(text);
    const today = new Date().toISOString().slice(0, 10);
    return {
      vendor_name: known ?? pickLikelyVendor(text),
      total_amount: parsedAmount.amount,
      purchase_date: clampPurchaseDate(parsedDate ?? "") ?? today,
      items: [],
      ocr_status: "ok",
      ocr_reason: "local_browser_ocr",
      raw_text: text,
      confidence: {
        vendor: known ? "high" : "medium",
        amount: parsedAmount.confidence,
        date: parsedDate ? "medium" : "low",
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
  let ocr: ReceiptOcrResult = {
    vendor_name: "Unknown",
    total_amount: 0,
    purchase_date: new Date().toISOString().slice(0, 10),
  };
  let source: OcrSource = "cloud";
  try {
    const form = new FormData();
    form.append("file", file);
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
    const local = await runLocalBrowserOcrWithTimeout(file, options?.localTimeoutMs ?? 8000);
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
  todayStr: string;
  vendorConfidence: FieldConfidence;
  amountConfidence: FieldConfidence;
  dateConfidence: FieldConfidence;
  autoFillVendor: boolean;
  autoFillAmount: boolean;
  autoFillDate: boolean;
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
  const dateFromRules = parseDateFromText(mergedText);
  const todayStr = new Date().toISOString().slice(0, 10);
  const purchaseFromOcr =
    ocrResults.find((r) => r.result.purchase_date)?.result.purchase_date ?? "";
  const clampedPurchase =
    clampPurchaseDate((dateFromRules ?? "").slice(0, 10)) ||
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
  let dateConfidence: FieldConfidence = clampedPurchase ? "medium" : "low";

  for (const r of ocrResults) {
    const oc = r.result.confidence;
    if (oc?.vendor) vendorConfidence = minFieldConfidence(vendorConfidence, oc.vendor);
    if (oc?.amount) amountConfidence = minFieldConfidence(amountConfidence, oc.amount);
    if (oc?.date) dateConfidence = minFieldConfidence(dateConfidence, oc.date);
  }
  if (clampedPurchase && dateConfidence === "low") {
    dateConfidence = "medium";
  }

  const autoFillVendor =
    vendorConfidence === "high" && finalVendor !== "Needs Review" && finalVendor !== "Unknown";
  const autoFillAmount = amountConfidence === "high" && sanitizedAmount != null;
  const autoFillDate = dateConfidence === "high" && clampedPurchase != null;

  return {
    mergedText,
    ocrResults,
    finalVendor,
    sanitizedAmount,
    clampedPurchase,
    finalDateSuggestion,
    todayStr,
    vendorConfidence,
    amountConfidence,
    dateConfidence,
    autoFillVendor,
    autoFillAmount,
    autoFillDate,
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
