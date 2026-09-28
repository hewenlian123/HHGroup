import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  remove: vi.fn(),
  deletePhoto: vi.fn(),
  deleteDocument: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/auth-boundary", () => ({ requireOrganizationRequestClient: mocks.guard }));
vi.mock("@/lib/data", () => ({
  getSitePhotoById: async () => ({
    id: "photo",
    project_id: "project",
    photo_url: "organizations/org/projects/project/documents/doc/image.png",
  }),
  updateSitePhoto: vi.fn(),
  deleteSitePhoto: mocks.deletePhoto,
}));
vi.mock("@/lib/documents-db", () => ({ deleteDocument: mocks.deleteDocument }));
import { NextResponse } from "next/server";
import { DELETE } from "@/app/api/operations/site-photos/[id]/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.remove.mockResolvedValue({ error: { message: "Storage unavailable" } });
  mocks.deleteDocument.mockRejectedValue(new Error("Storage unavailable"));
  mocks.guard.mockResolvedValue({
    ok: true,
    client: { storage: { from: () => ({ remove: mocks.remove }) }, from: mocks.from },
    sessionResponse: NextResponse.next(),
  });
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: { id: "doc" }, error: null }),
  };
  mocks.from.mockReturnValue(query);
});
it("does not report deletion or remove the photo row when private file cleanup fails", async () => {
  const result = await DELETE(
    new Request("http://localhost/api/operations/site-photos/photo", { method: "DELETE" }),
    { params: Promise.resolve({ id: "photo" }) }
  );
  expect(result.status).toBe(500);
  expect(mocks.deletePhoto).not.toHaveBeenCalled();
});
it("requires project write authorization before deleting files", async () => {
  mocks.guard
    .mockResolvedValueOnce({ ok: true, client: {}, sessionResponse: NextResponse.next() })
    .mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 403 }),
    });
  const result = await DELETE(
    new Request("http://localhost/api/operations/site-photos/photo", { method: "DELETE" }),
    { params: Promise.resolve({ id: "photo" }) }
  );
  expect(result.status).toBe(403);
  expect(mocks.deleteDocument).not.toHaveBeenCalled();
});
