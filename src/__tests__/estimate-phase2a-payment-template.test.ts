import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { applyPaymentTemplateToEstimateWithClient } from "@/lib/estimates-db";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260822120000_payment_template_atomic_application.sql"
);

describe("Estimate Phase 2A payment template application", () => {
  it.each(["replace", "merge"] as const)(
    "sends only canonical ids and %s mode to the atomic database function",
    async (mode) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            applied_count: 2,
            scheduled_total: 100000,
            remaining_total: 0,
          },
        ],
        error: null,
      });

      const result = await applyPaymentTemplateToEstimateWithClient(
        { rpc } as never,
        "estimate-1",
        "template-1",
        mode
      );

      expect(rpc).toHaveBeenCalledWith("apply_payment_schedule_template", {
        p_estimate_id: "estimate-1",
        p_template_id: "template-1",
        p_mode: mode,
      });
      expect(result).toEqual({
        appliedCount: 2,
        scheduledTotal: 100000,
        remainingTotal: 0,
      });
    }
  );

  it("defines a locked, server-authoritative, fixed-dollar atomic application contract", () => {
    expect(fs.existsSync(MIGRATION)).toBe(true);
    const sql = fs.readFileSync(MIGRATION, "utf8");

    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.apply_payment_schedule_template/i
    );
    expect(sql).toMatch(/from\s+public\.estimates[\s\S]*for\s+update/i);
    expect(sql).toMatch(/sum\(coalesce\(i\.qty,\s*0\)\s*\*\s*coalesce\(i\.unit_cost,\s*0\)\)/i);
    expect(sql).toMatch(/m\.tax\s*-\s*m\.discount/i);
    expect(sql).toMatch(/when\s+'percent'[\s\S]*estimate_total/i);
    expect(sql).toMatch(/round\([\s\S]*2\)/i);
    expect(sql).toMatch(
      /p_mode\s*=\s*'replace'[\s\S]*delete\s+from\s+public\.estimate_payment_schedule_items/i
    );
    expect(sql).toMatch(/p_mode\s*=\s*'merge'/i);
    expect(sql).toMatch(/invoice_id\s+is\s+not\s+null|status\s*<>\s*'draft'/i);
    expect(sql).toMatch(/v_template_total[\s\S]*>\s*v_estimate_total/i);
    expect(sql).toMatch(/grant\s+execute[\s\S]*to\s+service_role/i);
    expect(sql).toMatch(/revoke\s+all[\s\S]*from\s+authenticated/i);
  });
});
