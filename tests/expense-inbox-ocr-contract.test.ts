import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("inbox upload stamps Honolulu today and leaves OCR to the server", async () => {
  const upload = await source("src/lib/expense-inbox-draft-upload-browser.ts");
  const modal = await source("src/app/financial/expenses/upload-receipts-queue-modal.tsx");
  assert.match(upload, /hawaiiTodayYmd\(/);
  assert.doesNotMatch(upload, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.doesNotMatch(upload, /scheduleInboxDraftExpenseOcr/);
  assert.match(modal, /mapWithConcurrency\(/);
  assert.match(modal, /\/api\/financial\/expenses\/ocr-worker/);
});

test("quick expense keeps the file fingerprint and queues OCR without backfilling old rows", async () => {
  const route = await source("src/app/api/financial/expenses/quick-expense/route.ts");
  const migration = await source("supabase/migrations/20260929010904_expense_inbox_ocr_unpaid.sql");
  assert.match(route, /file_sha256/);
  assert.match(route, /inbox_capture:\s*true/);
  assert.match(route, /ocr_status:\s*"pending"/);
  assert.match(migration, /inbox_capture boolean not null default false/);
  assert.doesNotMatch(migration, /update\s+public\.expenses\s+set\s+inbox_capture/i);
  assert.doesNotMatch(migration, /update\s+public\.vendors/i);
});

test("approval accepts unpaid settlement and review queue is wired", async () => {
  const [approve, reviewPage, reviewClient, worker] = await Promise.all([
    source("src/app/api/financial/expenses/[id]/approve-inbox/route.ts"),
    source("src/app/financial/inbox/review/page.tsx"),
    source("src/app/financial/inbox/review/inbox-review-client.tsx"),
    source("src/app/api/financial/expenses/ocr-worker/route.ts"),
  ]);
  assert.match(approve, /settlementForApproval/);
  assert.match(approve, /settlement/);
  assert.match(reviewPage, /InboxReviewClient/);
  assert.match(reviewClient, /data-testid="inbox-review-queue"/);
  assert.match(reviewClient, /data-testid="inbox-duplicate-warning"/);
  assert.match(reviewClient, /data-testid="inbox-review-approve"/);
  assert.match(reviewClient, /approve-inbox/);
  assert.match(worker, /processInboxOcrBatch/);
});

test("canonical cost still treats inbox capture as excluded until approval", async () => {
  const cost = await source("src/lib/expense-canonical-cost.ts");
  assert.match(cost, /inbox_capture === true/);
  assert.match(cost, /INBOX_UPLOAD_REF_PREFIX/);
});
