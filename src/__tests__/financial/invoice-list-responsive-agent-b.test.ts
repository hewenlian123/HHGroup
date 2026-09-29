import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const invoiceListSource = readFileSync(
  fileURLToPath(new URL("../../app/financial/invoices/invoices-list-client.tsx", import.meta.url)),
  "utf8"
);

describe("invoice list responsive presentation", () => {
  it("uses the stacked invoice cards below the dense-table breakpoint", () => {
    expect(invoiceListSource).toContain('className="hidden xl:block"');
    expect(invoiceListSource).toContain(
      'className="grid grid-cols-1 gap-2 p-2.5 lg:grid-cols-2 xl:hidden"'
    );
    expect(invoiceListSource).toContain('className="h-11 w-11 min-h-11 min-w-11');
    expect(invoiceListSource).toContain('"h-11 min-h-11 flex-1 rounded-hh-standard shadow-none"');
    expect(invoiceListSource).toContain('className="h-hh-control-standard gap-hh-2"');
    expect(invoiceListSource).toContain(
      'className="h-hh-control-standard min-h-[var(--hh-control-height-standard)] bg-[var(--hh-input-background)]'
    );
    expect(invoiceListSource).toContain(
      '"h-hh-control-standard min-h-[var(--hh-control-height-standard)] shrink-0 gap-hh-2 px-hh-3"'
    );
    expect(invoiceListSource).toContain(
      'className="h-hh-control-standard min-h-[var(--hh-control-height-standard)] w-full"'
    );
    expect(invoiceListSource).toContain(
      'className="h-hh-control-standard min-h-[var(--hh-control-height-standard)] tabular-nums"'
    );
  });
});
