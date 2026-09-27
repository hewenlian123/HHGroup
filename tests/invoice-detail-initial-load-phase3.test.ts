import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8").catch(() => "");
}

test("Invoice Detail receives server initial data without a mount-time refresh", async () => {
  const client = await source("src/app/financial/invoices/[id]/invoice-detail-client.tsx");

  assert.match(client, /initialData:\s*InvoiceDetailData/);
  assert.match(client, /useState<InvoiceWithDerived\s*\|\s*null>\(initialData\.invoice\)/);
  assert.doesNotMatch(
    client,
    /React\.useEffect\(\(\)\s*=>\s*\{\s*refresh\(\);\s*\},\s*\[refresh\]\s*\)/
  );
});

test("Invoice Detail server page distinguishes not-found from unavailable data", async () => {
  const page = await source("src/app/financial/invoices/[id]/page.tsx");

  assert.doesNotMatch(page, /^\s*["']use client["']/);
  assert.match(page, /requireSupabaseOwnerOrAdminServerActionClient\(\{\s*noStore:\s*true\s*\}\)/);
  assert.match(page, /loadInvoiceDetailWithClient\(id,\s*guard\.client\)/);
  assert.match(page, /if\s*\(!initialData\)\s*notFound\(\)/);
  assert.match(page, /<ServerDataLoadFallback/);
});
