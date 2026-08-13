import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("runtime schema auto-repair Change Order contract", () => {
  it("does not recreate the retired project_change_orders.amount compatibility column", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "ensure-schema-auto-repair.ts"),
      "utf8"
    );

    expect(source).not.toContain(
      "ALTER TABLE public.project_change_orders ADD COLUMN IF NOT EXISTS amount"
    );
  });
});
