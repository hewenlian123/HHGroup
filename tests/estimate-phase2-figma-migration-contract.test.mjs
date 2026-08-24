import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 2 keeps one production-owned Estimate surface for each Figma drawer", async () => {
  const [detail, editor, customerSection, header] = await Promise.all([
    read("src/app/estimates/[id]/estimate-detail-client.tsx"),
    read("src/app/estimates/_components/estimate-editor.tsx"),
    read("src/app/estimates/_components/estimate-edit-customer-section.tsx"),
    read("src/app/estimates/[id]/estimate-detail-header.tsx"),
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
  assert.match(editor, /surface="notes"/);
  assert.match(editor, /surface="payment"/);
  assert.match(detail, /setDetailsSurface\("information"\)/);
  assert.match(detail, /setDetailsSurface\("pricing"\)/);
  assert.match(customerSection, /estimateSurfaceSheetClassName\(detailsSurface/);
  assert.match(customerSection, /data-estimate-surface=\{detailsSurface\}/);
  assert.match(customerSection, /"Advanced Pricing"/);
  assert.match(customerSection, /Customer \/ project \/ pricing details/);
  assert.equal((editor.match(/<EstimateNotesClarifications/g) ?? []).length, 1);
  assert.equal((editor.match(/<EstimatePaymentSchedule/g) ?? []).length, 1);
});

test("Phase 2 rich Description remains compact until explicitly edited", async () => {
  const source = await read("src/app/estimates/_components/proposal-scope-work-card.tsx");

  assert.match(source, /const \[descriptionEditing, setDescriptionEditing\]/);
  assert.match(source, /const minPx = 104/);
  assert.match(source, /aria-expanded="false"/);
  assert.match(source, /data-testid="estimate-description-done"/);
  assert.doesNotMatch(source, /Description commands/);
  for (const label of ["Bold", "Italic", "Bullet list", "Numbered list"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
});

test("Phase 2 keeps flexible production units while offering the approved suggestions", async () => {
  const source = await read("src/app/estimates/_components/estimate-editor.tsx");

  assert.match(source, /const ESTIMATE_UNIT_SUGGESTIONS = \[/);
  for (const unit of ["LS", "EA", "HR", "DAY", "SF", "LF", "CY", "LB", "TON", "ALLOW"]) {
    assert.match(source, new RegExp(`"${unit}"`));
  }
  assert.match(source, /<Input\s+type="text"\s+value=\{unit\}/);
  assert.match(source, /<datalist id=\{`estimate-unit-options-/);
});
