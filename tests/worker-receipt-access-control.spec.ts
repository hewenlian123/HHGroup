import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { addE2EAssistantSession, getE2EOwnerCredentials } from "./e2e-auth-owner";

const BUCKET = "worker-receipts";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3NwAAAABJRU5ErkJggg==",
  "base64"
);
const workerId = randomUUID();
const projectId = randomUUID();
const legacyReceiptId = randomUUID();
const assistantEmail = `receipt-access-${randomUUID()}@example.invalid`;
const assistantPassword = "Hh!ReceiptAccessFixture1";
const adminEmail = `receipt-admin-${randomUUID()}@example.invalid`;
const adminPassword = "Hh!ReceiptAccessAdmin1";
const legacyPath = `uploads/${randomUUID()}.png`;
const directUploadPath = `uploads/${randomUUID()}.png`;
const nonexistentUploadPath = `uploads/${randomUUID()}.png`;
const malformedUploadPath = `uploads/not-a-uuid.png`;
const workerName = "[Receipt RLS Fixture] Active Worker";
const projectName = "[Receipt RLS Fixture] Active Project";

function localConfig(): { url: string; anonKey: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Worker receipt security test requires local Supabase credentials.");
  }
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error("Worker receipt security test is local-Docker only.");
  }
  return { url, anonKey, serviceRoleKey };
}

function client(key: string): SupabaseClient {
  return createClient(localConfig().url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function authenticatedClient(email: string, password: string): Promise<SupabaseClient> {
  const supabase = client(localConfig().anonKey);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Unable to sign in local receipt access fixture: ${error.message}`);
  return supabase;
}

test.describe.serial("worker receipt local RLS and private Storage", () => {
  test.describe.configure({ timeout: 120_000 });
  const config = localConfig();
  const admin = client(config.serviceRoleKey);
  const anon = client(config.anonKey);
  const legacyPublicUrl = `${config.url.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${legacyPath}`;
  let submittedPath = "";
  let submittedReceiptId = "";
  let assistantUserId = "";
  let adminUserId = "";

  test.beforeAll(async () => {
    const worker = await admin
      .from("workers")
      .insert({ id: workerId, name: workerName, status: "active" });
    if (worker.error) throw new Error(`Unable to create worker fixture: ${worker.error.message}`);

    const project = await admin
      .from("projects")
      .insert({ id: projectId, name: projectName, status: "active" });
    if (project.error)
      throw new Error(`Unable to create project fixture: ${project.error.message}`);

    const object = await admin.storage.from(BUCKET).upload(legacyPath, PNG, {
      contentType: "image/png",
      upsert: false,
    });
    if (object.error)
      throw new Error(`Unable to create legacy object fixture: ${object.error.message}`);

    const receipt = await admin.from("worker_receipts").insert({
      id: legacyReceiptId,
      worker_id: workerId,
      worker_name: workerName,
      project_id: projectId,
      expense_type: "Other",
      amount: 12.34,
      receipt_url: legacyPublicUrl,
      receipt_date: "2026-08-10",
      status: "Pending",
    });
    if (receipt.error)
      throw new Error(`Unable to create legacy receipt fixture: ${receipt.error.message}`);

    const { data, error } = await admin.auth.admin.createUser({
      app_metadata: { role: "assistant" },
      email: assistantEmail,
      email_confirm: true,
      password: assistantPassword,
      user_metadata: { display_name: "Receipt RLS Fixture Assistant" },
    });
    if (error || !data.user)
      throw new Error(`Unable to create assistant fixture: ${error?.message}`);
    assistantUserId = data.user.id;

    const adminFixture = await admin.auth.admin.createUser({
      app_metadata: { role: "admin" },
      email: adminEmail,
      email_confirm: true,
      password: adminPassword,
      user_metadata: { display_name: "Receipt RLS Fixture Admin" },
    });
    if (adminFixture.error || !adminFixture.data.user) {
      throw new Error(`Unable to create admin fixture: ${adminFixture.error?.message}`);
    }
    adminUserId = adminFixture.data.user.id;
  });

  test.afterAll(async () => {
    await admin.from("worker_receipts").delete().eq("id", legacyReceiptId);
    if (submittedReceiptId)
      await admin.from("worker_receipts").delete().eq("id", submittedReceiptId);
    await admin.storage
      .from(BUCKET)
      .remove([legacyPath, directUploadPath, submittedPath].filter(Boolean));
    await admin.from("projects").delete().eq("id", projectId);
    await admin.from("workers").delete().eq("id", workerId);
    if (assistantUserId) await admin.auth.admin.deleteUser(assistantUserId, false);
    if (adminUserId) await admin.auth.admin.deleteUser(adminUserId, false);
  });

  test("allows only the public receipt intake while keeping objects and rows private", async ({
    request,
  }) => {
    const bucket = await admin.storage.getBucket(BUCKET);
    expect(bucket.error).toBeNull();
    expect(bucket.data?.public).toBe(false);

    const anonymousList = await anon.storage.from(BUCKET).list("uploads");
    // Storage masks rows filtered by RLS with an empty list instead of a policy error.
    expect(anonymousList.data ?? []).toEqual([]);

    const anonymousRead = await anon.storage.from(BUCKET).download(legacyPath);
    expect(anonymousRead.error).toBeTruthy();

    const anonymousPublicRead = await request.get(legacyPublicUrl, {
      headers: { apikey: config.anonKey },
    });
    expect(anonymousPublicRead.status()).not.toBe(200);

    const validDirectUpload = await anon.storage.from(BUCKET).upload(directUploadPath, PNG, {
      contentType: "image/png",
      upsert: false,
    });
    expect(validDirectUpload.error).toBeNull();

    const malformedDirectUpload = await anon.storage.from(BUCKET).upload(malformedUploadPath, PNG, {
      contentType: "image/png",
      upsert: false,
    });
    expect(malformedDirectUpload.error).toBeTruthy();

    const crossUserDelete = await anon.storage.from(BUCKET).remove([legacyPath]);
    expect(crossUserDelete.data ?? []).toEqual([]);
    const retainedObject = await admin.storage.from(BUCKET).download(legacyPath);
    expect(retainedObject.error).toBeNull();

    const anonymousRows = await anon.from("worker_receipts").select("id");
    expect(anonymousRows.data ?? []).toEqual([]);

    const anonymousUpdate = await anon
      .from("worker_receipts")
      .update({ amount: 99 })
      .eq("id", legacyReceiptId)
      .select("id");
    expect(anonymousUpdate.data ?? []).toEqual([]);

    const anonymousDelete = await anon
      .from("worker_receipts")
      .delete()
      .eq("id", legacyReceiptId)
      .select("id");
    expect(anonymousDelete.data ?? []).toEqual([]);
    const retainedReceipt = await admin
      .from("worker_receipts")
      .select("amount")
      .eq("id", legacyReceiptId)
      .single();
    expect(retainedReceipt.error).toBeNull();
    expect(retainedReceipt.data).toEqual({ amount: 12.34 });

    const sensitiveWorkerFields = await anon
      .from("workers")
      .select("phone, daily_rate")
      .eq("id", workerId);
    expect(sensitiveWorkerFields.error).toBeTruthy();

    const sensitiveProjectFields = await anon
      .from("projects")
      .select("budget, client_email")
      .eq("id", projectId);
    expect(sensitiveProjectFields.error).toBeTruthy();

    const options = await request.get("/api/upload-receipt/options");
    expect(options.status()).toBe(200);
    const optionsBody = (await options.json()) as {
      workers: Array<Record<string, string>>;
      projects: Array<Record<string, string>>;
    };
    expect(optionsBody.workers.find((row) => row.id === workerId)).toEqual({
      id: workerId,
      name: workerName,
    });
    expect(optionsBody.projects.find((row) => row.id === projectId)).toEqual({
      id: projectId,
      name: projectName,
    });
    expect(
      optionsBody.workers.every((row) => Object.keys(row).sort().join(",") === "id,name")
    ).toBe(true);
    expect(
      optionsBody.projects.every((row) => Object.keys(row).sort().join(",") === "id,name")
    ).toBe(true);

    const upload = await request.post("/api/upload-receipt/upload", {
      multipart: { file: { name: "receipt.png", mimeType: "image/png", buffer: PNG } },
    });
    expect(upload.status()).toBe(200);
    const uploadBody = (await upload.json()) as { ok: boolean; path: string; receipt_url: string };
    expect(uploadBody).toMatchObject({ ok: true });
    expect(uploadBody.path).toMatch(/^uploads\/[0-9a-f-]{36}\.png$/);
    expect(uploadBody.receipt_url).toBe(uploadBody.path);
    submittedPath = uploadBody.path;

    const malformedWrite = await anon.from("worker_receipts").insert({
      worker_id: workerId,
      worker_name: "Forged worker name",
      project_id: projectId,
      expense_type: "Other",
      amount: 11,
      receipt_url: directUploadPath,
      receipt_date: "2026-08-10",
    });
    expect(malformedWrite.error).toBeTruthy();

    const nonexistentObjectWrite = await anon.from("worker_receipts").insert({
      worker_id: workerId,
      worker_name: workerName,
      project_id: projectId,
      expense_type: "Other",
      amount: 11,
      receipt_url: nonexistentUploadPath,
      receipt_date: "2026-08-10",
    });
    expect(nonexistentObjectWrite.error).toBeTruthy();

    const malformedSubmit = await request.post("/api/upload-receipt/submit", {
      data: { workerId: "not-a-uuid" },
    });
    expect(malformedSubmit.status()).toBe(400);

    const submit = await request.post("/api/upload-receipt/submit", {
      data: {
        workerId,
        workerName,
        projectId,
        expenseType: "Other",
        amount: 22.5,
        receiptUrl: submittedPath,
        receiptDate: "2026-08-10",
      },
    });
    expect(submit.status()).toBe(200);
    expect(await submit.json()).toEqual({ ok: true });

    const submitted = await admin
      .from("worker_receipts")
      .select("id, status, receipt_url, reimbursement_id, rejection_reason")
      .eq("receipt_url", submittedPath)
      .single();
    expect(submitted.error).toBeNull();
    expect(submitted.data).toMatchObject({
      status: "Pending",
      receipt_url: submittedPath,
      reimbursement_id: null,
      rejection_reason: null,
    });
    submittedReceiptId = String(submitted.data?.id ?? "");
  });

  test("denies an authenticated non-owner and permits owner/admin review through signed private access", async ({
    browser,
    request,
    baseURL,
  }) => {
    const assistant = await authenticatedClient(assistantEmail, assistantPassword);
    const assistantRows = await assistant
      .from("worker_receipts")
      .select("id")
      .eq("id", legacyReceiptId);
    expect(assistantRows.data ?? []).toEqual([]);

    const assistantObjectList = await assistant.storage.from(BUCKET).list("uploads");
    expect(assistantObjectList.data ?? []).toEqual([]);
    const assistantObjectRead = await assistant.storage.from(BUCKET).download(legacyPath);
    expect(assistantObjectRead.error).toBeTruthy();
    const assistantObjectDelete = await assistant.storage.from(BUCKET).remove([legacyPath]);
    expect(assistantObjectDelete.data ?? []).toEqual([]);
    expect((await admin.storage.from(BUCKET).download(legacyPath)).error).toBeNull();

    const assistantUpdate = await assistant
      .from("worker_receipts")
      .update({ amount: 99 })
      .eq("id", legacyReceiptId)
      .select("id");
    expect(assistantUpdate.data ?? []).toEqual([]);

    const assistantDelete = await assistant
      .from("worker_receipts")
      .delete()
      .eq("id", legacyReceiptId)
      .select("id");
    expect(assistantDelete.data ?? []).toEqual([]);

    const assistantContext = await browser.newContext({ baseURL });
    try {
      await addE2EAssistantSession(assistantContext, baseURL || "http://localhost:3000");
      expect((await assistantContext.request.get("/api/worker-receipts")).status()).toBe(403);
      expect((await assistantContext.request.get("/api/upload-receipt/sync")).status()).toBe(403);
      expect(
        (
          await assistantContext.request.post("/api/worker-receipts/view", {
            data: { receiptUrl: legacyPublicUrl },
          })
        ).status()
      ).toBe(403);
    } finally {
      await assistantContext.close();
    }

    expect((await request.get("/api/worker-receipts")).status()).toBe(401);
    expect((await request.get("/api/upload-receipt/sync")).status()).toBe(401);

    const ownerCredentials = await getE2EOwnerCredentials();
    const owner = await authenticatedClient(ownerCredentials.email, ownerCredentials.password);
    const ownerRows = await owner.from("worker_receipts").select("id").eq("id", legacyReceiptId);
    expect(ownerRows.data).toEqual([{ id: legacyReceiptId }]);
    const adminReviewer = await authenticatedClient(adminEmail, adminPassword);
    const adminRows = await adminReviewer
      .from("worker_receipts")
      .select("id")
      .eq("id", legacyReceiptId);
    expect(adminRows.data).toEqual([{ id: legacyReceiptId }]);

    const ownerSession = await owner.auth.getSession();
    expect(ownerSession.error).toBeNull();
    if (!ownerSession.data.session) throw new Error("Owner fixture session is missing.");
    const ownerHeaders = { Authorization: `Bearer ${ownerSession.data.session.access_token}` };

    const review = await request.get("/api/worker-receipts", { headers: ownerHeaders });
    expect(review.status()).toBe(200);
    const reviewBody = (await review.json()) as {
      receipts: Array<{ id: string; receiptUrl: string | null }>;
    };
    expect(
      reviewBody.receipts.some((row) =>
        row.receiptUrl?.includes(`/storage/v1/object/sign/${BUCKET}/uploads/`)
      )
    ).toBe(true);

    const signedReview = await request.post("/api/worker-receipts/view", {
      headers: ownerHeaders,
      data: { receiptUrl: legacyPublicUrl },
    });
    expect(signedReview.status()).toBe(200);
    const signedReviewBody = (await signedReview.json()) as { signedUrl: string };
    expect(signedReviewBody.signedUrl).toContain(`/storage/v1/object/sign/${BUCKET}/${legacyPath}`);
    expect((await request.get(signedReviewBody.signedUrl)).status()).toBe(200);

    expect(
      (await request.get("/api/upload-receipt/sync", { headers: ownerHeaders })).status()
    ).toBe(200);
  });

  test("allows protected Reject only for owner/admin and preserves rejection semantics", async ({
    request,
  }) => {
    const reset = async () => {
      const result = await admin
        .from("worker_receipts")
        .update({ status: "Pending", rejection_reason: null, reimbursement_id: null })
        .eq("id", legacyReceiptId);
      expect(result.error).toBeNull();
    };

    await reset();
    try {
      const anonymousReject = await request.post(`/api/worker-receipts/${legacyReceiptId}/reject`, {
        data: { reason: "Anonymous attempt" },
      });
      expect(anonymousReject.status()).toBe(401);

      const assistant = await authenticatedClient(assistantEmail, assistantPassword);
      const assistantSession = await assistant.auth.getSession();
      expect(assistantSession.error).toBeNull();
      if (!assistantSession.data.session) throw new Error("Assistant fixture session is missing.");
      const assistantReject = await request.post(`/api/worker-receipts/${legacyReceiptId}/reject`, {
        headers: {
          Authorization: `Bearer ${assistantSession.data.session.access_token}`,
        },
        data: { reason: "Assistant attempt" },
      });
      expect(assistantReject.status()).toBe(403);

      const afterDenied = await admin
        .from("worker_receipts")
        .select("status, rejection_reason, reimbursement_id")
        .eq("id", legacyReceiptId)
        .single();
      expect(afterDenied.error).toBeNull();
      expect(afterDenied.data).toEqual({
        status: "Pending",
        rejection_reason: null,
        reimbursement_id: null,
      });

      const ownerCredentials = await getE2EOwnerCredentials();
      const owner = await authenticatedClient(ownerCredentials.email, ownerCredentials.password);
      const ownerSession = await owner.auth.getSession();
      expect(ownerSession.error).toBeNull();
      if (!ownerSession.data.session) throw new Error("Owner fixture session is missing.");
      const ownerReason = "Owner rejection fixture";
      const ownerReject = await request.post(`/api/worker-receipts/${legacyReceiptId}/reject`, {
        headers: { Authorization: `Bearer ${ownerSession.data.session.access_token}` },
        data: { reason: ownerReason },
      });
      expect(ownerReject.status(), await ownerReject.text()).toBe(200);
      expect(await ownerReject.json()).toMatchObject({
        receipt: {
          id: legacyReceiptId,
          status: "Rejected",
          rejectionReason: ownerReason,
          reimbursementId: null,
        },
      });

      const ownerPersisted = await admin
        .from("worker_receipts")
        .select("status, rejection_reason, reimbursement_id")
        .eq("id", legacyReceiptId)
        .single();
      expect(ownerPersisted.error).toBeNull();
      expect(ownerPersisted.data).toEqual({
        status: "Rejected",
        rejection_reason: ownerReason,
        reimbursement_id: null,
      });

      await reset();

      const adminReviewer = await authenticatedClient(adminEmail, adminPassword);
      const adminSession = await adminReviewer.auth.getSession();
      expect(adminSession.error).toBeNull();
      if (!adminSession.data.session) throw new Error("Admin fixture session is missing.");
      const adminReason = "Admin rejection fixture";
      const adminReject = await request.post(`/api/worker-receipts/${legacyReceiptId}/reject`, {
        headers: { Authorization: `Bearer ${adminSession.data.session.access_token}` },
        data: { reason: adminReason },
      });
      expect(adminReject.status(), await adminReject.text()).toBe(200);

      const adminPersisted = await admin
        .from("worker_receipts")
        .select("status, rejection_reason, reimbursement_id")
        .eq("id", legacyReceiptId)
        .single();
      expect(adminPersisted.error).toBeNull();
      expect(adminPersisted.data).toEqual({
        status: "Rejected",
        rejection_reason: adminReason,
        reimbursement_id: null,
      });
    } finally {
      await reset();
    }
  });
});
