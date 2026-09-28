import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Estimate actions, notes, and payment workflows remain connected", async () => {
  const [detail, editor, customerSection, header, paymentSchedule] = await Promise.all([
    read("src/app/estimates/[id]/estimate-detail-client.tsx"),
    read("src/app/estimates/_components/estimate-editor.tsx"),
    read("src/app/estimates/_components/estimate-edit-customer-section.tsx"),
    read("src/app/estimates/[id]/estimate-detail-header.tsx"),
    read("src/app/estimates/_components/estimate-payment-schedule.tsx"),
  ]);

  for (const action of [
    "onInfoClick",
    "onPricingClick",
    "onNotesClick",
    "onPaymentScheduleClick",
    "onActivityClick",
    "onRevisionHistoryClick",
  ]) {
    assert.match(header, new RegExp(`${action}\\?`));
  }
  assert.match(detail, /surface="activity"/);
  assert.match(detail, /surface="revision"/);
  assert.match(editor, /onNotesChange=\{updateDocumentNotes\}/);
  assert.doesNotMatch(editor, /saveEstimateInternalNotesInlineAction|internalNotesSaveQueueRef/);
  assert.match(customerSection, /<CustomerSelectWithAdd/);
  assert.match(customerSection, /fetch\("\/api\/projects"/);
  assert.match(paymentSchedule, /reorderPaymentScheduleAction/);
  assert.match(paymentSchedule, /markPaymentMilestonePaidAction/);
  assert.match(paymentSchedule, /Schedule exceeds the Estimate total by/);
});

test("rich descriptions and flexible production units remain editable", async () => {
  const [card, editor] = await Promise.all([
    read("src/app/estimates/_components/proposal-scope-work-card.tsx"),
    read("src/app/estimates/_components/estimate-editor.tsx"),
  ]);

  const description = await read("src/app/estimates/_components/estimate-description-editor.tsx");
  assert.match(card, /<EstimateDescriptionEditor/);
  assert.match(description, /active && !disabled && !readOnly/);
  assert.match(description, /contentEditable=\{!disabled && !readOnly\}/);
  for (const command of ["bold", "italic", "insertUnorderedList", "insertOrderedList"]) {
    assert.match(description, new RegExp(`command: "${command}"`));
  }
  for (const unit of ["LS", "EA", "HR", "DAY", "SF", "LF", "CY", "LB", "TON", "ALLOW"]) {
    assert.match(editor, new RegExp(`"${unit}"`));
  }
  assert.match(editor, /<Input\s+type="text"\s+value=\{unit\}/);
});
