import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const invoiceDetailSource = readFileSync(
  fileURLToPath(new URL("../../app/financial/invoices/[id]/page.tsx", import.meta.url)),
  "utf8"
);

describe("invoice detail touch targets", () => {
  it("keeps command and activity actions at 44px below the xl dense-table breakpoint", () => {
    expect(invoiceDetailSource).toMatch(
      /const toolbarButtonClass =\s+"[^"\n]*min-h-\[44px\][^"\n]*xl:min-h-9"/
    );
    expect(invoiceDetailSource).toMatch(
      /const primaryToolbarButtonClass =\s+"[^"\n]*min-h-\[44px\][^"\n]*xl:min-h-9"/
    );
    expect(invoiceDetailSource).toContain('"h-11 min-h-11 xl:h-8 xl:min-h-8');
    expect(invoiceDetailSource).toContain('className="w-16 px-2 py-2 text-right xl:w-10"');
  });
});
