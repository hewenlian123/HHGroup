import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("Payments and Deposits keep dense desktop grids out of the 820px tablet layout", async () => {
  const [payments, deposits] = await Promise.all([
    source("src/app/financial/payments/page.tsx"),
    source("src/app/financial/deposits/page.tsx"),
  ]);

  assert.match(payments, /hidden lg:grid grid-cols-\[/);
  assert.match(payments, /lg:grid lg:grid-cols-\[/);
  assert.match(deposits, /hidden lg:grid grid-cols-\[/);
  assert.match(deposits, /lg:grid lg:grid-cols-\[/);
});

test("Payment row actions retain a 44px target before the desktop density breakpoint", async () => {
  const payments = await source("src/app/financial/payments/page.tsx");
  assert.match(
    payments,
    /h-11 min-h-\[44px\] lg:h-8 lg:min-h-0 rounded-hh-compact px-2 text-xs shadow-none/
  );
});

test("Payments and Deposits keep filter and empty-state commands touch-sized through tablet", async () => {
  const [payments, deposits] = await Promise.all([
    source("src/app/financial/payments/page.tsx"),
    source("src/app/financial/deposits/page.tsx"),
  ]);
  for (const page of [payments, deposits]) {
    assert.match(page, /h-11 min-h-\[44px\][^"]*lg:h-10 lg:min-h-10/);
    assert.match(page, /h-11 min-h-\[44px\] lg:h-9 lg:min-h-0 rounded-hh-compact shadow-none/);
  }
});

test("Deposits exposes its workspace search only after the mobile header search", async () => {
  const deposits = await source("src/app/financial/deposits/page.tsx");
  assert.match(deposits, /hidden min-w-\[240px\] flex-1 flex-col gap-1 md:flex/);
});

test("Financial KPI summaries keep two columns through tablet before desktop density", async () => {
  const [payments, deposits] = await Promise.all([
    source("src/app/financial/payments/page.tsx"),
    source("src/app/financial/deposits/page.tsx"),
  ]);
  assert.match(payments, /grid grid-cols-2 gap-2 lg:grid-cols-5/);
  assert.match(deposits, /grid grid-cols-2 gap-2 lg:grid-cols-4/);
});
