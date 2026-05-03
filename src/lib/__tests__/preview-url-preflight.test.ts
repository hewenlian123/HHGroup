import { describe, expect, it, vi, afterEach } from "vitest";
import { classifyStorageUrlPrefix, preflightPreviewUrl } from "../preview-url-preflight";

describe("preflightPreviewUrl", () => {
  const orig = global.fetch;

  afterEach(() => {
    global.fetch = orig;
  });

  it("treats 200 HEAD as ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, type: "basic" });
    const r = await preflightPreviewUrl("https://example.test/file.jpg");
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("treats 403 as not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, type: "basic" });
    const r = await preflightPreviewUrl("https://example.test/sign");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });

  it("falls back to GET Range when HEAD returns 405", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405, type: "basic" })
      .mockResolvedValueOnce({ ok: true, status: 206, type: "basic" });
    global.fetch = fetchMock;
    const r = await preflightPreviewUrl("https://example.test/obj");
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("classifyStorageUrlPrefix", () => {
  it("detects sign and public paths", () => {
    expect(classifyStorageUrlPrefix("https://x.supabase.co/storage/v1/object/sign/b/p")).toBe(
      "/object/sign/"
    );
    expect(classifyStorageUrlPrefix("https://x.supabase.co/storage/v1/object/public/b/p")).toBe(
      "/object/public/"
    );
    expect(classifyStorageUrlPrefix("")).toBe("(empty)");
  });
});
