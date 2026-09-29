import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

test("client reimbursement stays out of the profit formula", () => {
  const profit = source("src/lib/profit-engine.ts");
  const rules = source("src/lib/client-reimbursement.ts");
  assert.match(profit, /Client-reimbursable lines stay in this sum/);
  assert.match(profit, /not subtracted here/);
  assert.match(rules, /export function jobCostWithClientReimbursement/);
  assert.doesNotMatch(profit, /reimbursableOutstanding/);
});

test("reimbursement PDF and review toggle are wired", () => {
  const pdf = source("src/lib/client-reimbursement-pdf.ts");
  const review = source("src/app/financial/inbox/review/inbox-review-client.tsx");
  const page = source("src/app/financial/client-reimbursements/page.tsx");
  const migration = source("supabase/migrations/20260929022100_client_reimbursable_expenses.sql");
  assert.match(pdf, /HH Constructions/);
  assert.match(review, /inbox-review-reimbursable/);
  assert.match(page, /loadClientReimbursements/);
  assert.match(migration, /client_reimbursable boolean not null default false/);
  assert.match(migration, /Does not update existing expense or expense_lines rows/);
  assert.doesNotMatch(migration, /new\.name/);
  assert.match(migration, /for update/);
  assert.match(
    source("src/app/api/financial/client-reimbursements/generate/route.ts"),
    /requireSupabaseOwnerOrAdminRequestClient/
  );
  assert.match(
    source("src/app/api/financial/client-reimbursements/generate/route.ts"),
    /documents/
  );
  assert.doesNotMatch(
    source("src/app/api/financial/client-reimbursements/generate/route.ts"),
    /getServerSupabaseInternalNoStore/
  );
});
