import { afterEach, describe, expect, it, vi } from "vitest";
import { preflightPreviewUrl } from "@/lib/preview-url-preflight";

describe("preflightPreviewUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defers signed Storage URL validation to the image request without a duplicate fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      preflightPreviewUrl(
        "http://127.0.0.1:54321/storage/v1/object/sign/expense-attachments/path.png?token=secret"
      )
    ).resolves.toMatchObject({ ok: true, method: "signed-object" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a ranged GET when a generic URL rejects HEAD", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 206 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(preflightPreviewUrl("https://example.test/receipt.png")).resolves.toMatchObject({
      ok: true,
      status: 206,
      method: "GET Range",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        method: "GET",
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
      })
    );
  });

  it("preserves the ranged GET failure status", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(preflightPreviewUrl("https://example.test/receipt.png")).resolves.toMatchObject({
      ok: false,
      status: 404,
      method: "GET Range",
    });
  });
});
