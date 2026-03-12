import { NextRequest, NextResponse } from "next/server";

export type ReceiptOcrResult = {
  vendor_name: string;
  total_amount: number;
  purchase_date: string;
  items?: Array<{ name?: string; amount?: number }>;
};

const today = () => new Date().toISOString().slice(0, 10);

function fallbackResult(): ReceiptOcrResult {
  return {
    vendor_name: "Unknown",
    total_amount: 0,
    purchase_date: today(),
    items: [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(fallbackResult());
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
        return NextResponse.json(fallbackResult());
      }
      const buf = await file.arrayBuffer();
      imageBase64 = Buffer.from(buf).toString("base64");
      mimeType = file.type || "image/jpeg";
    } else {
      return NextResponse.json(fallbackResult());
    }

    if (!imageBase64) {
      return NextResponse.json(fallbackResult());
    }

    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract receipt information from this image. Reply with ONLY a JSON object (no markdown, no code block) with these exact keys:
vendor_name (string, merchant/store name),
total_amount (number, total paid),
purchase_date (string, YYYY-MM-DD if visible else null),
items (optional array of { name: string, amount: number } for line items).
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
      return NextResponse.json(fallbackResult());
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(fallbackResult());
    }

    const parsed = JSON.parse(content) as ReceiptOcrResult;
    const result: ReceiptOcrResult = {
      vendor_name: typeof parsed.vendor_name === "string" ? parsed.vendor_name : "Unknown",
      total_amount: Number(parsed.total_amount) || 0,
      purchase_date:
        typeof parsed.purchase_date === "string" && parsed.purchase_date
          ? parsed.purchase_date.slice(0, 10)
          : today(),
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
    return NextResponse.json(result);
  } catch (e) {
    console.error("OCR error:", e);
    return NextResponse.json(fallbackResult());
  }
}
