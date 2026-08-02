import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  addFooterMock,
  addHeaderMock,
  adminFactoryMock,
  adminFromMock,
  documentInsertMock,
  documentMaybeSingleMock,
  documentSingleMock,
  fetchCompanyMock,
  getCanonicalProjectProfitMock,
  getCloseoutCompletionMock,
  getCloseoutPunchMock,
  getProjectBillingSummaryMock,
  getProjectByIdMock,
  getSelectionsByProjectMock,
  insertDocumentMock,
  projectMaybeSingleMock,
  removeMock,
  storageFromMock,
  strictRequestAuthMock,
  textMock,
  uploadMock,
  userRpcMock,
} = vi.hoisted(() => ({
  addFooterMock: vi.fn(),
  addHeaderMock: vi.fn(),
  adminFactoryMock: vi.fn(),
  adminFromMock: vi.fn(),
  documentInsertMock: vi.fn(),
  documentMaybeSingleMock: vi.fn(),
  documentSingleMock: vi.fn(),
  fetchCompanyMock: vi.fn(),
  getCanonicalProjectProfitMock: vi.fn(),
  getCloseoutCompletionMock: vi.fn(),
  getCloseoutPunchMock: vi.fn(),
  getProjectBillingSummaryMock: vi.fn(),
  getProjectByIdMock: vi.fn(),
  getSelectionsByProjectMock: vi.fn(),
  insertDocumentMock: vi.fn(),
  projectMaybeSingleMock: vi.fn(),
  removeMock: vi.fn(),
  storageFromMock: vi.fn(),
  strictRequestAuthMock: vi.fn(),
  textMock: vi.fn(),
  uploadMock: vi.fn(),
  userRpcMock: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  getCloseoutCompletion: getCloseoutCompletionMock,
  getCloseoutPunch: getCloseoutPunchMock,
  getProjectBillingSummary: getProjectBillingSummaryMock,
  getProjectById: getProjectByIdMock,
  getSelectionsByProject: getSelectionsByProjectMock,
  insertDocument: insertDocumentMock,
}));

vi.mock("@/lib/document-company-pdf", () => ({
  addDocumentCompanyPdfFooter: addFooterMock,
  addDocumentCompanyPdfHeader: addHeaderMock,
}));

vi.mock("@/lib/document-company-profile", () => ({
  fetchDocumentCompanyProfile: fetchCompanyMock,
}));

vi.mock("@/lib/profit-engine", () => ({
  getCanonicalProjectProfit: getCanonicalProjectProfitMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: adminFactoryMock,
  getStrictSupabaseRequestAuth: strictRequestAuthMock,
}));

vi.mock("jspdf", () => ({
  jsPDF: class MockJsPdf {
    addPage = vi.fn();
    output = vi.fn(() => new ArrayBuffer(16));
    setFont = vi.fn();
    setFontSize = vi.fn();
    text = textMock;
  },
}));

import { POST as generateMaterialPdf } from "@/app/api/projects/[id]/materials/generate-pdf/route";
import { POST as generateCompletionPdf } from "@/app/api/projects/[id]/closeout/generate-completion-pdf/route";
import { POST as generateFinalInvoicePdf } from "@/app/api/projects/[id]/closeout/generate-final-invoice-pdf/route";
import { POST as generatePunchPdf } from "@/app/api/projects/[id]/closeout/generate-punch-pdf/route";

const APP_ORIGIN = "http://localhost:3104";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const SECOND_IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ORIGINAL_ENV = { ...process.env };

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => Promise<Response>;

type RouteCase = {
  body?: Record<string, unknown>;
  documentPrefix: string;
  name: string;
  path: string;
  permission: "finance.manage" | "projects.update";
  post: RouteHandler;
};

const routes: RouteCase[] = [
  {
    documentPrefix: "material-selections",
    name: "Project Material PDF",
    path: `/api/projects/${PROJECT_ID}/materials/generate-pdf`,
    permission: "projects.update",
    post: generateMaterialPdf,
  },
  {
    body: {
      projectName: "Verified Project",
      completion_date: "2026-08-01",
      contractor_name: "HH Group",
      client_name: "Verified Client",
    },
    documentPrefix: "completion-certificate",
    name: "Completion Certificate PDF",
    path: `/api/projects/${PROJECT_ID}/closeout/generate-completion-pdf`,
    permission: "projects.update",
    post: generateCompletionPdf,
  },
  {
    documentPrefix: "final-invoice",
    name: "Final Invoice PDF",
    path: `/api/projects/${PROJECT_ID}/closeout/generate-final-invoice-pdf`,
    permission: "finance.manage",
    post: generateFinalInvoicePdf,
  },
  {
    documentPrefix: "final-punch",
    name: "Final Punch List PDF",
    path: `/api/projects/${PROJECT_ID}/closeout/generate-punch-pdf`,
    permission: "projects.update",
    post: generatePunchPdf,
  },
];

const userClient = { rpc: userRpcMock };

const projectQuery = {
  eq: vi.fn(),
  maybeSingle: projectMaybeSingleMock,
  select: vi.fn(),
};
projectQuery.eq.mockReturnValue(projectQuery);
projectQuery.select.mockReturnValue(projectQuery);

const documentQuery = {
  eq: vi.fn(),
  insert: documentInsertMock,
  maybeSingle: documentMaybeSingleMock,
  select: vi.fn(),
  single: documentSingleMock,
};
documentQuery.eq.mockReturnValue(documentQuery);
documentQuery.insert.mockReturnValue(documentQuery);
documentQuery.select.mockReturnValue(documentQuery);

const adminClient = {
  from: adminFromMock,
  storage: {
    from: storageFromMock,
  },
};

function verifiedUser(role: "owner" | "admin" | "assistant" = "owner") {
  return {
    app_metadata: { role },
    aud: "authenticated",
    created_at: "2026-08-01T00:00:00.000Z",
    id: USER_ID,
    user_metadata: {},
  };
}

function requestFor(
  route: RouteCase,
  options: {
    authorization?: string;
    body?: BodyInit | null;
    cookie?: string;
    idempotencyKey?: string | null;
    origin?: string | null;
    secFetchSite?: string | null;
  } = {}
): Request {
  const headers = new Headers();
  const origin = options.origin === undefined ? APP_ORIGIN : options.origin;
  const fetchSite = options.secFetchSite === undefined ? "same-origin" : options.secFetchSite;
  const idempotencyKey =
    options.idempotencyKey === undefined ? IDEMPOTENCY_KEY : options.idempotencyKey;
  if (origin) headers.set("origin", origin);
  if (fetchSite) headers.set("sec-fetch-site", fetchSite);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  if (options.authorization) headers.set("authorization", options.authorization);
  if (options.cookie) headers.set("cookie", options.cookie);

  const body =
    options.body !== undefined ? options.body : route.body ? JSON.stringify(route.body) : undefined;
  if (typeof body === "string") headers.set("content-type", "application/json");

  return new Request(`${APP_ORIGIN}${route.path}`, {
    method: "POST",
    headers,
    body,
  });
}

async function callRoute(route: RouteCase, request = requestFor(route), projectId = PROJECT_ID) {
  return route.post(request, { params: Promise.resolve({ id: projectId }) });
}

describe("Project PDF route-local P0 security", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };

    strictRequestAuthMock.mockReset().mockResolvedValue({
      client: userClient,
      source: "cookie",
      user: verifiedUser(),
    });
    userRpcMock.mockReset().mockResolvedValue({ data: true, error: null });

    projectMaybeSingleMock.mockReset().mockResolvedValue({
      data: { id: PROJECT_ID, name: "Verified Project", client_name: "Verified Client" },
      error: null,
    });
    documentMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
    documentSingleMock.mockReset().mockResolvedValue({
      data: { id: "55555555-5555-4555-8555-555555555555" },
      error: null,
    });
    documentInsertMock.mockClear();

    adminFromMock.mockReset().mockImplementation((table: string) => {
      if (table === "projects") return projectQuery;
      if (table === "documents") return documentQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    adminFactoryMock.mockReset().mockReturnValue(adminClient);

    uploadMock.mockReset().mockResolvedValue({ data: { path: "stored.pdf" }, error: null });
    removeMock.mockReset().mockResolvedValue({ data: [], error: null });
    storageFromMock.mockReset().mockReturnValue({ remove: removeMock, upload: uploadMock });

    getProjectByIdMock.mockReset().mockResolvedValue({
      budget: 100,
      client_name: "Verified Client",
      id: PROJECT_ID,
      name: "Verified Project",
      spent: 0,
      status: "active",
    });
    getSelectionsByProjectMock.mockReset().mockResolvedValue([]);
    getCloseoutCompletionMock.mockReset().mockResolvedValue({
      client_name: "Verified Client",
      client_signature: null,
      completion_date: "2026-08-01",
      contractor_name: "HH Group",
      contractor_signature: null,
    });
    getCloseoutPunchMock.mockReset().mockResolvedValue(null);
    getProjectBillingSummaryMock.mockReset().mockResolvedValue({ paidTotal: 25 });
    getCanonicalProjectProfitMock.mockReset().mockResolvedValue({ revenue: 100 });
    insertDocumentMock.mockReset().mockResolvedValue({ id: "legacy-document-id" });
    fetchCompanyMock.mockReset().mockResolvedValue({});
    addHeaderMock.mockReset().mockResolvedValue(20);
    addFooterMock.mockReset();
    textMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it.each(routes)("$name returns 401 anonymously before any privileged work", async (route) => {
    strictRequestAuthMock.mockResolvedValue(null);

    const response = await callRoute(route);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, message: "Authentication required." });
    expect(adminFactoryMock).not.toHaveBeenCalled();
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(getProjectBillingSummaryMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name rejects an invalid Bearer without falling back", async (route) => {
    strictRequestAuthMock.mockResolvedValue(null);

    const response = await callRoute(
      route,
      requestFor(route, {
        authorization: "Bearer invalid-token",
        cookie: "sb-valid-cookie=must-not-fallback",
        origin: null,
        secFetchSite: "none",
      })
    );

    expect(response.status).toBe(401);
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name remains strict when compatibility mode is enabled", async (route) => {
    process.env.HH_REQUIRE_LOGIN = "false";
    process.env.HH_ALLOW_LOCAL_NO_LOGIN = "1";
    strictRequestAuthMock.mockResolvedValue(null);

    const response = await callRoute(route);

    expect(response.status).toBe(401);
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name rejects a cross-origin mutation", async (route) => {
    const response = await callRoute(
      route,
      requestFor(route, { origin: "https://evil.test", secFetchSite: "cross-site" })
    );

    expect(response.status).toBe(403);
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name rejects an invalid project UUID", async (route) => {
    const response = await callRoute(route, requestFor(route), "not-a-uuid");

    expect(response.status).toBe(400);
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name enforces its narrow route permission", async (route) => {
    userRpcMock.mockResolvedValue({ data: false, error: null });
    strictRequestAuthMock.mockResolvedValue({
      client: userClient,
      source: "cookie",
      user: verifiedUser("assistant"),
    });

    const response = await callRoute(route);

    expect(response.status).toBe(403);
    expect(userRpcMock).toHaveBeenCalledWith("has_perm", { p_key: route.permission });
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name returns a generic 404 for a missing project", async (route) => {
    projectMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    const response = await callRoute(route, requestFor(route), MISSING_PROJECT_ID);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, message: "Project not found." });
    expect(getProjectBillingSummaryMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name accepts a verified Bearer without a cookie", async (route) => {
    strictRequestAuthMock.mockResolvedValue({
      client: userClient,
      source: "bearer",
      user: verifiedUser("owner"),
    });

    const response = await callRoute(
      route,
      requestFor(route, {
        authorization: "Bearer verified-token",
        origin: null,
        secFetchSite: "none",
      })
    );

    expect(response.status).toBe(200);
    expect(userRpcMock).toHaveBeenCalledWith("has_perm", { p_key: route.permission });
  });

  it.each(routes)(
    "$name scopes privileged reads to the post-authorization admin client",
    async (route) => {
      const response = await callRoute(route);

      expect(response.status).toBe(200);
      if (route === routes[0]) {
        expect(getSelectionsByProjectMock).toHaveBeenCalledWith(PROJECT_ID, adminClient);
      } else if (route === routes[1]) {
        expect(getCloseoutCompletionMock).toHaveBeenCalledWith(PROJECT_ID, adminClient);
      } else if (route === routes[2]) {
        expect(getProjectBillingSummaryMock).toHaveBeenCalledWith(PROJECT_ID, adminClient);
        expect(getCanonicalProjectProfitMock).toHaveBeenCalledWith(PROJECT_ID, adminClient);
      } else {
        expect(getCloseoutPunchMock).toHaveBeenCalledWith(PROJECT_ID, adminClient);
      }
    }
  );

  it.each(routes)("$name rejects a missing idempotency key", async (route) => {
    const response = await callRoute(route, requestFor(route, { idempotencyKey: null }));

    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name rejects malformed JSON", async (route) => {
    const response = await callRoute(route, requestFor(route, { body: "{" }));

    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name rejects unexpected body fields", async (route) => {
    const body = route.body
      ? JSON.stringify({ ...route.body, unexpected_private_path: "bucket/internal.pdf" })
      : JSON.stringify({ unexpected_private_path: "bucket/internal.pdf" });

    const response = await callRoute(route, requestFor(route, { body }));

    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects oversized Completion Certificate input", async () => {
    const route = routes[1];
    const response = await callRoute(
      route,
      requestFor(route, {
        body: JSON.stringify({ ...route.body, contractor_name: "x".repeat(501) }),
      })
    );

    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("does not calculate final invoice billing before authorization", async () => {
    strictRequestAuthMock.mockResolvedValue(null);

    const response = await callRoute(routes[2]);

    expect(response.status).toBe(401);
    expect(getProjectBillingSummaryMock).not.toHaveBeenCalled();
    expect(getCanonicalProjectProfitMock).not.toHaveBeenCalled();
  });

  it.each(routes)("$name uses an immutable server-generated object identity", async (route) => {
    const response = await callRoute(route);

    expect(response.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^projects/${PROJECT_ID}/(materials|closeout)/${route.documentPrefix}-${IDEMPOTENCY_KEY}\\.pdf$`
        )
      ),
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: "application/pdf", upsert: false })
    );
  });

  it("returns the existing result for a repeated idempotency key", async () => {
    const route = routes[0];
    documentMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValue({
      data: { id: "55555555-5555-4555-8555-555555555555" },
      error: null,
    });

    const first = await callRoute(route, requestFor(route));
    const second = await callRoute(route, requestFor(route));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(documentInsertMock).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent equivalent requests without duplicate rows or objects", async () => {
    const route = routes[0];
    let releaseFirstUpload: (() => void) | undefined;
    let markFirstUploadStarted: (() => void) | undefined;
    const firstUploadStarted = new Promise<void>((resolve) => {
      markFirstUploadStarted = resolve;
    });
    uploadMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstUpload = () => resolve({ data: { path: "stored.pdf" }, error: null });
            markFirstUploadStarted?.();
          })
      )
      .mockResolvedValueOnce({
        data: null,
        error: { message: "The resource already exists", statusCode: "409" },
      });

    const firstResponse = callRoute(route, requestFor(route));
    await firstUploadStarted;
    const duplicateResponse = await callRoute(route, requestFor(route));
    releaseFirstUpload?.();
    const successfulResponse = await firstResponse;

    expect(successfulResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(409);
    expect(documentInsertMock).toHaveBeenCalledTimes(1);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("does not delete the winner's object when concurrent uploads both reach metadata", async () => {
    const route = routes[0];
    documentMaybeSingleMock
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: "55555555-5555-4555-8555-555555555555" },
        error: null,
      });
    documentSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const response = await callRoute(route);

    expect(response.status).toBe(200);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("uses different object identities for unique requests in the same second", async () => {
    const route = routes[3];

    const first = await callRoute(route, requestFor(route));
    const second = await callRoute(
      route,
      requestFor(route, { idempotencyKey: SECOND_IDEMPOTENCY_KEY })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const paths = uploadMock.mock.calls.map(([path]) => path);
    expect(new Set(paths).size).toBe(2);
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(IDEMPOTENCY_KEY),
        expect.stringContaining(SECOND_IDEMPOTENCY_KEY),
      ])
    );
  });

  it("removes only the newly uploaded object when document metadata fails", async () => {
    const route = routes[1];
    documentSingleMock.mockResolvedValue({
      data: null,
      error: { message: "schema details at private/table" },
    });

    const response = await callRoute(route);
    const expectedPath = `projects/${PROJECT_ID}/closeout/completion-certificate-${IDEMPOTENCY_KEY}.pdf`;

    expect(response.status).toBe(500);
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith([expectedPath]);
    expect(removeMock).not.toHaveBeenCalledWith(["unrelated/object.pdf"]);
    expect(JSON.stringify(await response.json())).not.toMatch(/schema|private|table/i);
  });

  it("creates no metadata when Storage upload fails and hides backend errors", async () => {
    uploadMock.mockResolvedValue({
      data: null,
      error: { message: "service_role bucket internals projects/private.pdf" },
    });

    const response = await callRoute(routes[0]);
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(documentInsertMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toMatch(/service_role|bucket|private/i);
  });

  it("preserves the verified project identity and PDF financial content", async () => {
    const completion = routes[1];
    const completionResponse = await callRoute(
      completion,
      requestFor(completion, {
        body: JSON.stringify({ ...completion.body, projectName: "Untrusted Project" }),
      })
    );
    const invoiceResponse = await callRoute(routes[2]);

    expect(completionResponse.status).toBe(200);
    expect(invoiceResponse.status).toBe(200);
    expect(textMock).toHaveBeenCalledWith("Project: Verified Project", 20, 20);
    expect(textMock).not.toHaveBeenCalledWith(
      "Project: Untrusted Project",
      expect.any(Number),
      expect.any(Number)
    );
    expect(textMock).toHaveBeenCalledWith(expect.stringContaining("Contract value:"), 20, 35);
    expect(textMock).toHaveBeenCalledWith(expect.stringContaining("Payments received:"), 20, 43);
    expect(textMock).toHaveBeenCalledWith(expect.stringContaining("Remaining balance:"), 20, 51);
  });
});
