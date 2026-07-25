import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadReceiptToStorage } from "@/lib/expense-receipt-upload-browser";

describe("uploadReceiptToStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads the original receipt file for stored preview quality", async () => {
    const originalBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    const original = new File([originalBytes], "iphone-receipt.png", { type: "image/png" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          path: "quick-expense/original-iphone-receipt.png",
          signed_url: "https://signed.example/receipt.png",
          public_url: "https://public.example/receipt.png",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const supabase = {
      storage: {
        from: vi.fn(),
      },
    };

    const slot = await uploadReceiptToStorage(supabase as never, original, "quality");
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    const uploaded = (body as FormData).get("file");
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe("iphone-receipt.png");
    expect((uploaded as File).type).toBe("image/png");
    expect((uploaded as File).size).toBe(original.size);
    expect(Array.from(new Uint8Array(await (uploaded as File).arrayBuffer()))).toEqual(
      Array.from(originalBytes)
    );

    expect(slot.previewUrl).toBe("https://signed.example/receipt.png");
    expect(slot.receiptsPublicUrl).toBe("https://public.example/receipt.png");
    expect(slot.storedFileName).toBe("iphone-receipt.png");
    expect(slot.storedMimeType).toBe("image/png");
    expect(slot.storedSize).toBe(original.size);
  });
});
