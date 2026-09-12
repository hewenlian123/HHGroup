import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Estimate editing preserves save ownership and state feedback", () => {
  const detail = source("src/app/estimates/[id]/estimate-detail-client.tsx");
  const editor = source("src/app/estimates/_components/estimate-editor.tsx");
  const saveStatus = source("src/app/estimates/_components/estimate-builder-save-status.tsx");

  assert.match(detail, /<EstimateDocumentSaveProvider>/);
  assert.match(detail, /const isLocked = !\["Draft", "Sent"\]\.includes\(status\)/);
  assert.match(detail, /await waitForPendingSaves\(\)/);
  assert.match(detail, /editing=\{editing && !isLocked\}/);
  assert.match(editor, /const isReadOnly = isLocked \|\| !editing/);
  for (const state of ["unsaved", "saving", "saved", "failed"]) {
    assert.match(saveStatus, new RegExp(`status === "${state}"|"${state}"`));
  }
  assert.match(saveStatus, /Save failed — try again/);
});

test("Estimate totals and payment schedules retain financial authority", () => {
  const pricing = source("src/app/estimates/_components/estimate-edit-customer-section.tsx");
  const payment = source("src/app/estimates/_components/estimate-payment-schedule.tsx");
  const database = source("src/lib/estimates-db.ts");
  const actions = source("src/app/estimates/[id]/actions.ts");

  assert.match(pricing, /estimateSubtotal \+ taxDraft - discountDraft/);
  assert.match(database, /const total = subtotal \+ tax - discount/);
  assert.match(payment, /Schedule exceeds the Estimate total by/);
  assert.match(payment, /const isOverallocated = remaining < -0\.005/);
  assert.match(database, /await assertPaymentScheduleAllocation/);
  assert.match(actions, /requireSupabaseOwnerOrAdminServerAction/);
  assert.match(actions, /Only Approved or Converted estimates can create milestone invoices/);
});

test("activity and revisions remain available and historical records stay read-only", () => {
  const detail = source("src/app/estimates/[id]/estimate-detail-client.tsx");
  const activity = source("src/app/estimates/_components/estimate-activity-timeline.tsx");
  const revisionData = source("src/lib/estimates-db.ts");

  assert.match(detail, /surface="activity"/);
  assert.match(detail, /surface="revision"/);
  assert.match(detail, /data-estimate-revision-state="historical-read-only"/);
  assert.match(activity, /Activity is temporarily unavailable/);
  assert.match(revisionData, /\.eq\("revision_root_id", source\.revision_root_id\)/);
});

test("Preview, Print, and PDF share the protected customer document content", () => {
  const previewPage = source("src/app/estimates/[id]/preview/page.tsx");
  const printPage = source("src/app/estimates/[id]/print/page.tsx");
  const printDocument = source("src/app/estimates/_components/estimate-print-document.tsx");

  assert.match(previewPage, /<EstimatePreviewContent/);
  assert.match(printDocument, /<EstimatePreviewContent \{\.\.\.props\} \/>/);
  assert.match(printPage, /data-read-only="true"/);
  assert.match(printPage, /estimate-print-pdf-capture/);
});
