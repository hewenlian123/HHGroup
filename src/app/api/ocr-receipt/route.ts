import { NextRequest, NextResponse } from "next/server";

export type ReceiptOcrResult = {
  vendor_name: string;
  total_amount: number;
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
purchase_date (string, YYYY-MM-DD if visible else null),
items (optional array of { name: string, amount: number } for line items),
payment_method (optional string: cash | card | debit | credit | unknown — infer from receipt if visible),
raw_text (string, short OCR text dump: store/title/total/date lines),
confidence (object with vendor, amount, date each one of: high | medium | low),
If something is not visible use: vendor_name "Unknown", total_amount 0, purchase_date null.`,
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
    const result: ReceiptOcrResult = {
      vendor_name: typeof parsed.vendor_name === "string" ? parsed.vendor_name : "Unknown",
      total_amount: Number(parsed.total_amount) || 0,
      purchase_date:
        typeof parsed.purchase_date === "string" && parsed.purchase_date
          ? parsed.purchase_date.slice(0, 10)
          : today(),
      items: Array.isArray(parsed.items)
        ? (parsed.items as Array<{ name?: string; amount?: number }>)
        : [],
      ocr_status: "ok",
      raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
      payment_method:
        typeof parsed.payment_method === "string" ? parsed.payment_method.trim() : undefined,
      confidence:
        typeof parsed.confidence === "object" && parsed.confidence
          ? {
              vendor:
                (parsed.confidence as Record<string, unknown>).vendor === "high" ||
                (parsed.confidence as Record<string, unknown>).vendor === "medium" ||
                (parsed.confidence as Record<string, unknown>).vendor === "low"
                  ? ((parsed.confidence as Record<string, unknown>).vendor as
                      | "high"
                      | "medium"
                      | "low")
                  : "low",
              amount:
                (parsed.confidence as Record<string, unknown>).amount === "high" ||
                (parsed.confidence as Record<string, unknown>).amount === "medium" ||
                (parsed.confidence as Record<string, unknown>).amount === "low"
                  ? ((parsed.confidence as Record<string, unknown>).amount as
                      | "high"
                      | "medium"
                      | "low")
                  : "low",
              date:
                (parsed.confidence as Record<string, unknown>).date === "high" ||
                (parsed.confidence as Record<string, unknown>).date === "medium" ||
                (parsed.confidence as Record<string, unknown>).date === "low"
                  ? ((parsed.confidence as Record<string, unknown>).date as
                      | "high"
                      | "medium"
                      | "low")
                  : "low",
            }
          : { vendor: "low", amount: "low", date: "low" },
    };
    return NextResponse.json(result);
  } catch (e) {
    console.error("OCR error:", e);
    return NextResponse.json(fallbackResult("Unhandled OCR exception"));
  }
}
