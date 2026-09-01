import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("Figma v2 Builder states preserve production editing and save ownership", () => {
  const detail = source("src/app/estimates/[id]/estimate-detail-client.tsx");
  const editor = source("src/app/estimates/_components/estimate-editor.tsx");
  const saveStatus = source("src/app/estimates/_components/estimate-builder-save-status.tsx");
  const shell = source("src/app/estimates/_components/estimate-builder-shell.tsx");

  assert.match(shell, /Shared Figma v2 light workspace canvas/);
  assert.match(shell, /className=\{cn\("estimate-builder", className\)\}/);
  assert.match(detail, /<EstimateDocumentSaveProvider>/);
  assert.match(detail, /const isLocked = !\["Draft", "Sent"\]\.includes\(status\)/);
  assert.match(detail, /await waitForPendingSaves\(\)/);
  assert.match(detail, /editing=\{editing && !isLocked\}/);
  assert.match(editor, /const isReadOnly = isLocked \|\| !editing/);
  for (const state of ["unsaved", "saving", "saved", "failed"]) {
    assert.match(saveStatus, new RegExp(`data-estimate-save-state=\\{status\\}`));
    assert.match(saveStatus, new RegExp(`status === "${state}"|"${state}"`));
  }
  assert.match(saveStatus, /Save failed — try again/);
});

test("Pricing Inspector is presentation over the existing customer-total contract", () => {
  const detail = source("src/app/estimates/[id]/estimate-detail-client.tsx");
  const pricing = source("src/app/estimates/_components/estimate-edit-customer-section.tsx");
  const calculations = source("src/lib/estimates-db.ts");

  assert.match(detail, /setDetailsSurface\("pricing"\)/);
  assert.match(pricing, /data-estimate-surface=\{detailsSurface\}/);
  assert.match(pricing, /"Estimate Terms"/);
  for (const field of ["tax", "discount"]) {
    assert.match(pricing, new RegExp(`name="${field}"`));
  }
  for (const legacyInternalField of ["overheadPct", "profitPct"]) {
    assert.doesNotMatch(pricing, new RegExp(`name="${legacyInternalField}"`));
  }
  assert.match(pricing, /estimateSubtotal \+ taxDraft - discountDraft/);
  assert.match(calculations, /const total = subtotal \+ tax - discount/);
  assert.match(calculations, /markup: 0/);
});

test("Payment Schedule keeps fixed-dollar, partial, and server-authoritative behavior", () => {
  const payment = source("src/app/estimates/_components/estimate-payment-schedule.tsx");
  const database = source("src/lib/estimates-db.ts");
  const actions = source("src/app/estimates/[id]/actions.ts");

  for (const action of [
    "addPaymentMilestoneAction",
    "updatePaymentMilestoneAction",
    "deletePaymentMilestoneAction",
    "reorderPaymentScheduleAction",
    "applyPaymentTemplateAction",
    "markPaymentMilestonePaidAction",
  ]) {
    assert.match(payment, new RegExp(action));
  }
  assert.match(payment, /Partial schedules are valid and may be saved/);
  assert.match(payment, /const isOverallocated = remaining < -0\.005/);
  assert.match(payment, /canCreateMilestoneInvoices/);
  assert.match(database, /return \["Draft", "Sent"\]\.includes\(est\.status as string\)/);
  assert.match(database, /return item\.amount/);
  assert.match(database, /await assertPaymentScheduleAllocation/);
  assert.match(actions, /requireSupabaseOwnerOrAdminServerAction/);
  assert.match(actions, /Only Approved or Converted estimates can create milestone invoices/);
});

test("Activity and Revision surfaces remain canonical and historical records stay read-only", () => {
  const detail = source("src/app/estimates/[id]/estimate-detail-client.tsx");
  const activity = source("src/app/estimates/_components/estimate-activity-timeline.tsx");
  const activityData = source("src/lib/estimate-activity.ts");
  const revisionData = source("src/lib/estimates-db.ts");

  assert.match(detail, /surface="activity"/);
  assert.match(detail, /surface="revision"/);
  assert.match(detail, /data-estimate-revision-state="historical-read-only"/);
  assert.match(detail, /Historical revision/);
  assert.match(detail, /href=\{`\/estimates\/\$\{revision\.id\}`\}/);
  assert.match(activity, /events === null/);
  assert.match(activity, /Activity is temporarily unavailable/);
  assert.match(activity, /events\.length === 0/);
  assert.match(activity, /formatEstimateActivityEvent\(event\)/);
  assert.match(activityData, /transition_estimate_status_with_activity/);
  assert.match(revisionData, /\.eq\("revision_root_id", source\.revision_root_id\)/);
  assert.match(revisionData, /isCurrent: String\(current\.id\) === String\(source\.id\)/);
});

test("Preview has a light application shell while Print and PDF preserve white Letter paper", () => {
  const previewPage = source("src/app/estimates/[id]/preview/page.tsx");
  const previewShell = source("src/app/estimates/[id]/preview/estimate-preview-shell.tsx");
  const printPage = source("src/app/estimates/[id]/print/page.tsx");
  const printDocument = source("src/app/estimates/_components/estimate-print-document.tsx");
  const globals = source("src/app/globals.css");

  assert.match(previewPage, /data-hh-context="viewer"/);
  assert.match(previewPage, /data-hh-theme="operational-light"/);
  assert.doesNotMatch(previewPage, /data-hh-theme="(?:neo|operational)-dark"/);
  assert.match(previewShell, /className="estimate-preview-shell/);
  assert.match(previewShell, /aria-label="Estimate preview actions"/);
  assert.match(previewPage, /<EstimatePreviewContent/);
  assert.match(printDocument, /<EstimatePreviewContent \{\.\.\.props\} \/>/);
  assert.match(printPage, /data-hh-theme="document-light"/);
  assert.match(printPage, /data-read-only="true"/);
  assert.match(printPage, /@page \{ size: Letter; margin: 0; \}/);
  assert.match(printPage, /estimate-print-pdf-capture/);
  assert.match(
    globals,
    /\.estimate-a4-page\s*\{[^}]*width: 8\.5in;[^}]*height: 11in;[^}]*background: #ffffff/s
  );
  assert.match(globals, /@media print \{[\s\S]*?@page \{[\s\S]*?size: Letter/);
});

test("Figma remains outside Auth, API, database, and lifecycle calculation ownership", () => {
  const mapping = source("docs/FIGMA_CODE_MAPPING_V2.md");
  const actions = source("src/app/estimates/[id]/actions.ts");
  const database = source("src/lib/estimates-db.ts");

  assert.match(mapping, /current WebApp remains authoritative/);
  assert.match(mapping, /Internal notes never enter Preview, Print, or PDF/);
  assert.match(
    mapping,
    /server-action exports, FormData field names, Auth guards, APIs, database schema, RPCs, and calculations/
  );
  assert.match(actions, /requireSupabaseOwnerOrAdminServerAction/);
  assert.match(database, /transitionEstimateStatusWithActivityWithClient/);
  assert.match(database, /paymentMilestoneAmount/);
});
