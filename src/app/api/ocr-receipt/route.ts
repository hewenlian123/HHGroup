import { NextRequest, NextResponse } from "next/server";

export type ReceiptOcrResult = {
  vendor_name: string;
  total_amount: number;
  tax_amount?: number;
  purchase_date: string;
  items?: Array<{ name?: string; amount?: number }>;
  ocr_status?: "ok" | "fallback";
  ocr_reason?: string;
  raw_text?: string;
  payment_method?: string;
  confidence?: {
    vendor?: "high" | "medium" | "low";
    amount?: "high" | "medium" | "low";
    date?: "high" | "medium" | "low";
  };
};

const today = () => new Date().toISOString().slice(0, 10);

type FieldConfidence = "high" | "medium" | "low";

function fallbackResult(reason?: string): ReceiptOcrResult {
  return {
    vendor_name: "Unknown",
    total_amount: 0,
    purchase_date: today(),
    items: [],
    ocr_status: "fallback",
    ocr_reason: reason,
    raw_text: "",
    confidence: { vendor: "low", amount: "low", date: "low" },
  };
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Some model responses wrap JSON in markdown fences.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitizeMoney(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 9_999_999) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded >= 1900 && rounded <= 2100 && Number.isInteger(rounded)) return null;
  return rounded;
}

function normalizeKnownVendor(raw: string): string | null {
  const t = (raw ?? "").toLowerCase();
  if (/\b(the\s+)?home\s+depot\b/.test(t)) return "Home Depot";
  if (/\blowe'?s?\b/.test(t) || /\blowes\b/.test(t)) return "Lowe's";
  if (/\bcostco\b/.test(t)) return "Costco";
  if (/\bwalmart\b/.test(t)) return "Walmart";
  if (/\bcity\s+mill\b/.test(t)) return "City Mill";
  if (/\bhardware\s+hawaii\b/.test(t)) return "Hardware Hawaii";
  if (/\b(shell|chevron|exxon|mobil|texaco|sunoco|76)\b/.test(t))
    return raw.trim() || "Gas station";
  return null;
}

function sanitizeVendor(raw: unknown, rawText: string): string {
  const known = normalizeKnownVendor(rawText) ?? normalizeKnownVendor(String(raw ?? ""));
  if (known) return known;
  const text = String(raw ?? "").trim();
  if (!text || text.length < 3 || !/[A-Za-z]/.test(text)) return "Unknown";
  return text.slice(0, 80);
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
    if (!hasDollar && !hasDecimal && n >= 1000) continue;
    const amount = sanitizeMoney(n);
    if (amount != null) out.push({ raw: raw.trim(), amount });
  }
  return out;
}

function isSubtotalOrTaxLine(line: string): boolean {
  return /\b(subtotal|sub-total|tax\s*:|sales\s*tax|vat|gst)\b/i.test(line);
}

function isNonFinalAmountLine(line: string): boolean {
  return /\b(total\s+savings?|you\s+saved|discount|coupon|rebate|change\s+due|cash\s+back|tendered|auth(?:orization)?|approval|total\s+items?|items\s+sold|quantity|qty)\b/i.test(
    line
  );
}

function parseTotalFromText(text: string): number | null {
  const labelRules = [
    { score: 100, pattern: /\b(amount\s+due|balance\s+due|total\s+due)\b/i },
    { score: 96, pattern: /\bgrand\s+total\b/i },
    { score: 94, pattern: /\bfuel\s+total\b/i },
    { score: 90, pattern: /\b(total|order\s+total|sale\s+total)\b/i },
    { score: 82, pattern: /\bamount\s+paid\b/i },
  ];
  const candidates: Array<{ score: number; amount: number }> = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim())) {
    if (!line || isSubtotalOrTaxLine(line) || isNonFinalAmountLine(line)) continue;
    const rule = labelRules.find((r) => r.pattern.test(line));
    if (!rule) continue;
    const amounts = parseMoneyCandidates(line);
    if (!amounts.length) continue;
    candidates.push({ score: rule.score, amount: amounts[amounts.length - 1]!.amount });
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.score - a.score || b.amount - a.amount)[0]!.amount;
}

function parseTaxFromText(text: string): number | null {
  for (const line of text.split(/\r?\n/).map((l) => l.trim())) {
    if (!/\b(sales\s*tax|tax|ge\s*tax|g\.?e\.?t\.?|vat|gst)\b/i.test(line)) continue;
    const amounts = parseMoneyCandidates(line);
    if (!amounts.length) continue;
    const currency = [...amounts].reverse().find((a) => a.raw.includes("$"));
    return (currency ?? amounts[amounts.length - 1]!).amount;
  }
  return null;
}

function clampDate(raw: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  if (y < 2000) return null;
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  if (dt > endToday) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalizeConfidence(raw: unknown): FieldConfidence {
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(fallbackResult("OPENAI_API_KEY missing"));
    }

    let imageBase64: string;
    let mimeType = "image/jpeg";

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      imageBase64 = body.imageBase64 ?? body.image;
      if (body.mimeType) mimeType = body.mimeType;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(fallbackResult("No file provided"));
      }
      const buf = await file.arrayBuffer();
      imageBase64 = Buffer.from(buf).toString("base64");
      mimeType = file.type || "image/jpeg";
    } else {
      return NextResponse.json(fallbackResult("Unsupported content type"));
    }

    if (!imageBase64) {
      return NextResponse.json(fallbackResult("Empty image payload"));
    }

    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract receipt information from this image. Reply with ONLY a JSON object (no markdown, no code block) with these exact keys:
vendor_name (string, merchant/store name),
total_amount (number, FINAL amount paid — prefer labels: Total, Grand Total, Balance Due, Amount Paid; NEVER use Subtotal, Tax alone, or partial lines),
tax_amount (optional number, sales/use tax if a tax line is visible; otherwise null),
purchase_date (string, YYYY-MM-DD if visible else null),
items (optional array of { name: string, amount: number } for line items),
payment_method (optional string: cash | card | debit | credit | unknown — infer from receipt if visible),
raw_text (string, short OCR text dump containing exact visible store/title/date/subtotal/tax/total/amount due lines),
confidence (object with vendor, amount, date each one of: high | medium | low),
If something is not visible use: vendor_name "Unknown", total_amount 0, tax_amount null, purchase_date null.
Do not infer a date, tax, or total from low-confidence text.`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI OCR error:", response.status, err);
      return NextResponse.json(fallbackResult(`OpenAI error ${response.status}`));
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((part: unknown) =>
                typeof part === "object" && part && "text" in part
                  ? String((part as { text?: unknown }).text ?? "")
                  : ""
              )
              .join("\n")
              .trim()
          : "";
    if (!content) {
      return NextResponse.json(fallbackResult("Empty OCR response"));
    }

    const parsed = parseJsonLoose(content);
    if (!parsed) {
      return NextResponse.json(fallbackResult("Invalid OCR JSON"));
    }
    const rawText = typeof parsed.raw_text === "string" ? parsed.raw_text : "";
    const rawTotal = parseTotalFromText(rawText);
    const parsedTotal = sanitizeMoney(parsed.total_amount);
    const rawTax = parseTaxFromText(rawText);
    const parsedTax = sanitizeMoney(parsed.tax_amount);
    const confidenceRaw =
      typeof parsed.confidence === "object" && parsed.confidence
        ? (parsed.confidence as Record<string, unknown>)
        : {};
    const amountFromRaw = rawTotal != null;
    const taxAmount = rawTax ?? parsedTax ?? undefined;
    const purchaseDate = clampDate(parsed.purchase_date) ?? today();
    const result: ReceiptOcrResult = {
      vendor_name: sanitizeVendor(parsed.vendor_name, rawText),
      total_amount: rawTotal ?? parsedTotal ?? 0,
      tax_amount: taxAmount,
      purchase_date: purchaseDate,
      items: Array.isArray(parsed.items)
        ? (parsed.items as Array<{ name?: string; amount?: number }>)
        : [],
      ocr_status: "ok",
      raw_text: rawText,
      payment_method:
        typeof parsed.payment_method === "string" ? parsed.payment_method.trim() : undefined,
      confidence: {
        vendor: normalizeConfidence(confidenceRaw.vendor),
        amount: amountFromRaw ? "high" : normalizeConfidence(confidenceRaw.amount),
        date: normalizeConfidence(confidenceRaw.date),
      },
    };
    return NextResponse.json(result);
  } catch (e) {
    console.error("OCR error:", e);
    return NextResponse.json(fallbackResult("Unhandled OCR exception"));
  }
}
