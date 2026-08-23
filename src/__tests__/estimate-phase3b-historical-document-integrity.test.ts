import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filename: vi.fn((identity: string) => `Estimate-${identity.replaceAll(" ", "_")}.pdf`),
  generatePdf: vi.fn(),
  getEstimateHeader: vi.fn(),
  getRevisionContext: vi.fn(),
  requireOwnerOrAdmin: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: mocks.requireOwnerOrAdmin,
}));
vi.mock("@/lib/data", () => ({
  getEstimateHeaderById: mocks.getEstimateHeader,
  getEstimateRevisionContext: mocks.getRevisionContext,
}));
vi.mock("@/lib/estimate-print-pdf", () => ({
  estimatePrintPdfFilename: mocks.filename,
  generateEstimatePrintPdfBuffer: mocks.generatePdf,
}));
vi.mock("@/lib/server-app-origin", () => ({
  resolveServerAppOrigin: () => "http://localhost:3000",
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseInternalNoStore: () => ({ kind: "read-client" }),
}));

const PREVIEW_PAGE = path.join(process.cwd(), "src/app/estimates/[id]/preview/page.tsx");
const PREVIEW_SHELL = path.join(
  process.cwd(),
  "src/app/estimates/[id]/preview/estimate-preview-shell.tsx"
);
const PRINT_PAGE = path.join(process.cwd(), "src/app/estimates/[id]/print/page.tsx");
const PRINT_ACTION_BAR = path.join(
  process.cwd(),
  "src/app/estimates/[id]/print/print-action-bar.tsx"
);
const PRINT_DOCUMENT = path.join(
  process.cwd(),
  "src/app/estimates/_components/estimate-print-document.tsx"
);

describe("Estimate Phase 3B historical document integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerOrAdmin.mockResolvedValue({ ok: true });
    mocks.getEstimateHeader.mockResolvedValue({ number: "EST-0053" });
    mocks.getRevisionContext.mockResolvedValue({ revisionNumber: 1 });
    mocks.generatePdf.mockResolvedValue(Buffer.from("%PDF fixture"));
  });

  it("names a downloaded PDF with the selected Estimate revision identity", async () => {
    const { GET } = await import("@/app/api/estimates/[id]/pdf/route");
    const response = await GET(new Request("http://localhost:3000/api/estimates/rev-1/pdf"), {
      params: Promise.resolve({ id: "rev-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getEstimateHeader).toHaveBeenCalledWith("rev-1", { kind: "read-client" });
    expect(mocks.getRevisionContext).toHaveBeenCalledWith("rev-1", { kind: "read-client" });
    expect(mocks.filename).toHaveBeenCalledWith("EST-0053 Rev 1");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Estimate-EST-0053_Rev_1.pdf"'
    );
  });

  it("fails closed instead of producing an ambiguously named PDF without lineage", async () => {
    mocks.getRevisionContext.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/estimates/[id]/pdf/route");
    const response = await GET(new Request("http://localhost:3000/api/estimates/rev-1/pdf"), {
      params: Promise.resolve({ id: "rev-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      message: expect.stringMatching(/revision identity/i),
    });
    expect(mocks.generatePdf).not.toHaveBeenCalled();
  });

  it("keeps Preview, Print, and PDF on the selected record and one shared renderer", () => {
    const previewPage = fs.readFileSync(PREVIEW_PAGE, "utf8");
    const previewShell = fs.readFileSync(PREVIEW_SHELL, "utf8");
    const printPage = fs.readFileSync(PRINT_PAGE, "utf8");
    const printActionBar = fs.readFileSync(PRINT_ACTION_BAR, "utf8");
    const printDocument = fs.readFileSync(PRINT_DOCUMENT, "utf8");

    expect(previewPage).toContain("if (!estimate || !meta || !revisionContext)");
    expect(printPage).toContain("if (!estimate || !meta || !revisionContext)");
    expect(previewPage).toContain("revisionContext={revisionContext}");
    expect(printPage).toContain("revisionContext={revisionContext}");
    expect(previewShell).toContain('data-testid="estimate-revision-context"');
    expect(printActionBar).toContain('data-testid="estimate-revision-context"');
    expect(previewShell).toContain("Previous revision");
    expect(previewShell).toContain("Next revision");
    expect(printActionBar).toContain("Previous revision");
    expect(printActionBar).toContain("Next revision");
    expect(previewShell).toContain("Historical revision");
    expect(printActionBar).toContain("Historical revision");
    expect(printDocument).toContain("<EstimatePreviewContent {...props} />");
  });
});
