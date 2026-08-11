import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("worker receipt runtime security contract", () => {
  it("keeps public upload and submit on the anon client without receipt readback", () => {
    const upload = source("src/app/api/upload-receipt/upload/route.ts");
    const submit = source("src/app/api/upload-receipt/submit/route.ts");

    expect(upload).toContain("getServerSupabase()");
    expect(upload).not.toContain("getServerSupabaseAdmin");
    expect(upload).toContain("receipt_url: path");
    expect(upload).not.toContain("getPublicUrl");

    expect(submit).toContain("getServerSupabase()");
    expect(submit).not.toContain("getServerSupabaseAdmin");
    expect(submit).toContain('.from("worker_receipts").insert');
    expect(submit).not.toContain(".select(");
    expect(submit).toContain("return NextResponse.json({ ok: true })");
  });

  it("requires verified owner/admin access before receipt mutation, sync, or signed review", () => {
    const sync = source("src/app/api/upload-receipt/sync/route.ts");
    const review = source("src/app/api/worker-receipts/view/route.ts");
    const list = source("src/app/api/worker-receipts/route.ts");
    const approve = source("src/app/api/worker-receipts/[id]/approve/route.ts");
    const remove = source("src/app/api/worker-receipts/[id]/route.ts");

    for (const route of [sync, review, list, approve, remove]) {
      expect(route).toContain("requireSupabaseOwnerOrAdmin");
      expect(route).not.toContain("requireSupabaseOwnerOrAdminWithClient");
      expect(route).toContain("getServerSupabaseAdmin");
      expect(route.indexOf("requireSupabaseOwnerOrAdmin")).toBeLessThan(
        route.indexOf("getServerSupabaseAdmin")
      );
    }
    expect(sync).not.toContain("getServerSupabase() ??");
    expect(review).toContain("createSignedStorageUrl");
    expect(list).toContain("createSignedStorageUrl");
  });

  it("keeps only documented receipt APIs public when strict middleware is enabled", () => {
    const middleware = source("src/middleware.ts");
    const publicPaths = middleware.slice(
      middleware.indexOf("const PUBLIC_API_PATHS"),
      middleware.indexOf("const STRICT_AUTH_PREFIXES")
    );

    expect(publicPaths).toContain('"/api/upload-receipt/options"');
    expect(publicPaths).toContain('"/api/upload-receipt/upload"');
    expect(publicPaths).toContain('"/api/upload-receipt/submit"');
    expect(publicPaths).not.toContain('"/api/upload-receipt/sync"');
    expect(publicPaths).not.toContain('"/api/worker-receipts"');
    expect(publicPaths).not.toContain('"/api/ocr-receipt"');
    expect(middleware).toContain('"/api/upload-receipt/sync"');
    expect(middleware).toContain('"/api/worker-receipts"');
    expect(middleware).toContain('"/api/ocr-receipt"');
  });

  it("uses the anon RLS client for public options and makes OCR strict", () => {
    const options = source("src/app/api/upload-receipt/options/route.ts");
    const ocr = source("src/app/api/ocr-receipt/route.ts");

    expect(options).toContain("getServerSupabase()");
    expect(options).not.toContain("getServerSupabaseAdmin");
    expect(options).toContain('.select("id, name")');

    expect(ocr).toContain("requireSupabaseOwnerOrAdmin");
    expect(ocr).toContain("const guard = await requireSupabaseOwnerOrAdmin(request)");
    expect(ocr).toContain("if (!guard.ok) return guard.response");
  });

  it("does not expose a service-role credential through receipt client code", () => {
    const sources = [
      "src/app/api/upload-receipt/upload/route.ts",
      "src/app/api/upload-receipt/submit/route.ts",
      "src/lib/worker-receipt-storage.ts",
      "src/lib/storage-signed-url.ts",
    ].map(source);

    for (const file of sources) {
      expect(file).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*SERVICE/i);
      expect(file).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    }
  });

  it("keeps valid reimbursement-only external historical evidence outside worker-receipt Storage signing", () => {
    const reimbursements = source("src/app/labor/reimbursements/page.tsx");
    const signedUrl = source("src/lib/storage-signed-url.ts");

    expect(reimbursements).toContain("resolvePreviewSignedUrl");
    expect(reimbursements).toContain("signed || u");
    expect(signedUrl).toContain("if (/^https?:\\/\\//i.test(raw))");
    expect(signedUrl).toContain("if (!parsed) return raw");
  });
});
