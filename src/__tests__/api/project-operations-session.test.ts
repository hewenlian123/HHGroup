import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const storage = {
    upload: vi.fn(),
    remove: vi.fn(),
  };
  const client = { from: vi.fn(), storage: { from: vi.fn(() => storage) } };
  return {
    client,
    storage,
    requestGuard: vi.fn(),
    actionGuard: vi.fn(),
    getSelectionsByProject: vi.fn(),
    getMaterialCatalog: vi.fn(),
    createMaterialSelection: vi.fn(),
    updateSelection: vi.fn(),
    insertDocument: vi.fn(),
    getDocumentById: vi.fn(),
    getDocumentSignedUrl: vi.fn(),
    deleteDocument: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/auth-boundary", () => ({
  requireOrganizationRequestClient: mocks.requestGuard,
  requireOrganizationServerActionClient: mocks.actionGuard,
}));
vi.mock("@/lib/data", () => ({
  getSelectionsByProject: mocks.getSelectionsByProject,
  getMaterialCatalog: mocks.getMaterialCatalog,
  createMaterialSelection: mocks.createMaterialSelection,
  insertDocument: mocks.insertDocument,
  getDocumentById: mocks.getDocumentById,
  getDocumentSignedUrl: mocks.getDocumentSignedUrl,
  deleteDocument: mocks.deleteDocument,
  DOCUMENT_FILE_TYPES: ["Other"],
}));
vi.mock("@/lib/material-selections-db", () => ({
  getSelectionsByProject: mocks.getSelectionsByProject,
  createSelection: mocks.createMaterialSelection,
  updateSelection: mocks.updateSelection,
}));
vi.mock("@/lib/material-catalog-db", () => ({ getMaterialCatalog: mocks.getMaterialCatalog }));
vi.mock("@/lib/documents-db", () => ({ insertDocument: mocks.insertDocument }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => ({ storage: { from: () => mocks.storage } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function documentForm() {
  const form = new FormData();
  form.set("file", new File(["sanitized test document"], "scope.pdf", { type: "application/pdf" }));
  form.set("notes", "Project scope");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.storage.from.mockReturnValue(mocks.storage);
  mocks.client.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { organization_id: "org-1" }, error: null }),
        maybeSingle: async () => ({ data: { organization_id: "org-1" }, error: null }),
      }),
    }),
  }));
  const guard = {
    ok: true,
    client: mocks.client,
    context: {
      organizationId: "org-1",
      organizationRole: "owner",
      memberships: [{ organization_id: "org-1", role: "owner" }],
      user: { id: "owner-test" },
    },
    sessionResponse: { cookies: { getAll: () => [] } },
  };
  mocks.requestGuard.mockResolvedValue(guard);
  mocks.actionGuard.mockResolvedValue(guard);
  mocks.getSelectionsByProject.mockResolvedValue([{ id: "selection-1", project_id: "project-1" }]);
  mocks.getMaterialCatalog.mockResolvedValue([{ id: "material-1" }]);
  mocks.createMaterialSelection.mockResolvedValue({ id: "selection-1", project_id: "project-1" });
  mocks.storage.upload.mockResolvedValue({ data: {}, error: null });
  mocks.storage.remove.mockResolvedValue({ data: [], error: null });
  mocks.insertDocument.mockResolvedValue({ id: "document-1", project_id: "project-1" });
  mocks.getDocumentById.mockResolvedValue({
    id: "document-1",
    project_id: "project-1",
    file_path: "documents/project-1/scope.pdf",
  });
  mocks.getDocumentSignedUrl.mockResolvedValue({ url: "https://example.test/signed-document" });
  mocks.deleteDocument.mockResolvedValue(true);
});

describe("project materials request session", () => {
  it("loads the selected project's materials with the verified request client", async () => {
    const { GET } = await import("@/app/api/projects/[id]/materials/route");
    const req = new Request("http://localhost/api/projects/project-1/materials");
    const result = await GET(req, { params: Promise.resolve({ id: "project-1" }) });

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({
      ok: true,
      selections: [{ id: "selection-1", project_id: "project-1" }],
      catalog: [{ id: "material-1" }],
    });
    expect(mocks.requestGuard).toHaveBeenCalledWith(req, { projectId: "project-1", noStore: true });
    expect(mocks.getSelectionsByProject).toHaveBeenCalledWith("project-1", mocks.client);
    expect(mocks.getMaterialCatalog).toHaveBeenCalledWith(mocks.client, "org-1");
  });

  it("creates a selection for the route project using the verified request client", async () => {
    const { POST } = await import("@/app/api/projects/[id]/materials/route");
    const req = new Request("http://localhost/api/projects/project-1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: "other-project", item: " Tile ", category: "Flooring" }),
    });
    const result = await POST(req, { params: Promise.resolve({ id: "project-1" }) });

    expect(result.ok).toBe(true);
    await expect(result.json()).resolves.toMatchObject({ ok: true });
    expect(mocks.requestGuard).toHaveBeenCalledWith(req, {
      projectId: "project-1",
      write: true,
      noStore: true,
    });
    expect(mocks.createMaterialSelection).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project-1", item: "Tile" }),
      mocks.client
    );
  });

  it.each(["GET", "POST"] as const)("denies %s before accessing project data", async (method) => {
    mocks.requestGuard.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }),
    });
    const route = await import("@/app/api/projects/[id]/materials/route");
    const req = new Request("http://localhost/api/projects/project-1/materials", {
      method,
      ...(method === "POST" ? { body: JSON.stringify({ item: "Tile" }) } : {}),
    });
    const result = await route[method](req, { params: Promise.resolve({ id: "project-1" }) });

    expect(result.status).toBe(401);
    expect(mocks.getSelectionsByProject).not.toHaveBeenCalled();
    expect(mocks.getMaterialCatalog).not.toHaveBeenCalled();
    expect(mocks.createMaterialSelection).not.toHaveBeenCalled();
  });
});

describe("project document server action session", () => {
  it("uploads and stores metadata for the same project through the verified session client", async () => {
    const { uploadProjectDocument } = await import("@/app/projects/[id]/documents/actions");
    const result = await uploadProjectDocument("project-1", documentForm());

    expect(result).toEqual({ ok: true });
    expect(mocks.actionGuard).toHaveBeenCalledWith({
      projectId: "project-1",
      write: true,
      noStore: true,
    });
    expect(mocks.client.storage.from).toHaveBeenCalledWith("attachments");
    const uploadedPath = mocks.storage.upload.mock.calls[0][0];
    expect(uploadedPath).toMatch(
      /^organizations\/org-1\/projects\/project-1\/documents\/[^/]+\/scope\.pdf$/
    );
    expect(mocks.insertDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project-1",
        file_path: uploadedPath,
        notes: "Project scope",
      }),
      mocks.client
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/projects/project-1");
  });

  it("rejects an expired session before uploading or inserting metadata", async () => {
    mocks.actionGuard.mockResolvedValue({ ok: false, message: "Unauthorized" });
    const { uploadProjectDocument } = await import("@/app/projects/[id]/documents/actions");

    await expect(uploadProjectDocument("project-1", documentForm())).resolves.toMatchObject({
      ok: false,
    });
    expect(mocks.storage.upload).not.toHaveBeenCalled();
    expect(mocks.insertDocument).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("never uploads an object when document metadata cannot be saved", async () => {
    mocks.insertDocument.mockRejectedValue(new Error("Document insert denied"));
    const { uploadProjectDocument } = await import("@/app/projects/[id]/documents/actions");

    await expect(uploadProjectDocument("project-1", documentForm())).resolves.toMatchObject({
      ok: false,
    });
    expect(mocks.storage.upload).not.toHaveBeenCalled();
    expect(mocks.storage.remove).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("document preview, download, and delete session", () => {
  it.each(["getDocumentPreviewUrl", "getDocumentDownloadUrl"] as const)(
    "%s authorizes both the document lookup and signed URL with the session client",
    async (action) => {
      const actions = await import("@/app/documents/actions");

      await expect(actions[action]("document-1")).resolves.toEqual({
        url: "https://example.test/signed-document",
      });
      expect(mocks.actionGuard).toHaveBeenCalledWith({ noStore: true });
      expect(mocks.getDocumentById).toHaveBeenCalledWith("document-1", mocks.client);
      expect(mocks.getDocumentSignedUrl).toHaveBeenCalledWith(
        "documents/project-1/scope.pdf",
        120,
        mocks.client
      );
    }
  );

  it.each(["getDocumentPreviewUrl", "getDocumentDownloadUrl"] as const)(
    "%s denies an expired session without reading or signing a document",
    async (action) => {
      mocks.actionGuard.mockResolvedValue({ ok: false, message: "Unauthorized" });
      const actions = await import("@/app/documents/actions");

      await expect(actions[action]("document-1")).resolves.toMatchObject({ url: null });
      expect(mocks.getDocumentById).not.toHaveBeenCalled();
      expect(mocks.getDocumentSignedUrl).not.toHaveBeenCalled();
    }
  );

  it("deletes the requested document and its object with the verified session client", async () => {
    const { deleteDocumentAction } = await import("@/app/documents/actions");

    await expect(deleteDocumentAction("document-1")).resolves.toEqual({ ok: true });
    expect(mocks.actionGuard).toHaveBeenCalledWith({ noStore: true });
    expect(mocks.deleteDocument).toHaveBeenCalledWith("document-1", true, mocks.client);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/documents");
  });

  it("denies document deletion before calling the database or storage boundary", async () => {
    mocks.actionGuard.mockResolvedValue({ ok: false, message: "Unauthorized" });
    const { deleteDocumentAction } = await import("@/app/documents/actions");

    await expect(deleteDocumentAction("document-1")).resolves.toMatchObject({ ok: false });
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports failure when the document deletion returns false", async () => {
    mocks.deleteDocument.mockResolvedValue(false);
    const { deleteDocumentAction } = await import("@/app/documents/actions");

    await expect(deleteDocumentAction("document-1")).resolves.toMatchObject({ ok: false });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

it("preserves refreshed session cookies on materials responses", async () => {
  const { NextResponse } = await import("next/server");
  const sessionResponse = NextResponse.next();
  sessionResponse.cookies.set("session-refresh", "renewed");
  mocks.requestGuard.mockResolvedValue({
    ok: true,
    client: mocks.client,
    sessionResponse,
    context: { organizationId: "org-1" },
  });
  const { GET, POST } = await import("@/app/api/projects/[id]/materials/route");
  for (const handler of [GET, POST]) {
    const res = await handler(
      new Request("http://localhost/api/projects/p/materials", {
        method: handler === POST ? "POST" : "GET",
        ...(handler === POST ? { body: JSON.stringify({ item: "Tile" }) } : {}),
      }),
      { params: Promise.resolve({ id: "p" }) }
    );
    expect(res.cookies.get("session-refresh")?.value).toBe("renewed");
  }
});
