import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const invoiceListSource = readFileSync(
  fileURLToPath(new URL("../../app/financial/invoices/page.tsx", import.meta.url)),
  "utf8"
);

describe("invoice list responsive presentation", () => {
  it("uses the stacked invoice cards below the dense-table breakpoint", () => {
    expect(invoiceListSource).toContain('className="hidden lg:block"');
    expect(invoiceListSource).toContain('className="space-y-2 p-2.5 lg:hidden"');
    expect(invoiceListSource).toContain('className="h-11 w-11 min-h-11 min-w-11');
    expect(invoiceListSource).toContain('"h-11 min-h-11 flex-1 rounded-hh-standard shadow-none"');
    expect(invoiceListSource).toMatch(/"h-11 min-h-11 [^"\n]*xl:h-\[34px\] xl:min-h-\[34px\]"/);
    expect(invoiceListSource).toMatch(
      /"h-11 min-h-11 border-transparent [^"\n]*xl:h-9 xl:min-h-9"/
    );
    expect(invoiceListSource).toMatch(/"h-11 min-h-11 shrink-0 [^"\n]*xl:h-9 xl:min-h-9"/);
    expect(invoiceListSource).toContain('className="h-11 min-h-11 tabular-nums"');
    expect(invoiceListSource).toContain(
      '"h-11 min-h-11 w-full bg-[var(--hh-l2-operational-surface)] xl:h-8 xl:min-h-8"'
    );
    expect(invoiceListSource).toContain(
      '"h-11 min-h-11 bg-[var(--hh-l2-operational-surface)] tabular-nums xl:h-8 xl:min-h-8"'
    );
  });
});
