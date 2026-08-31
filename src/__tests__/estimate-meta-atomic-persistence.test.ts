import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { updateEstimateMetaWithClient } from "@/lib/estimates-db";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260830014500_estimate_financial_persistence_hardening.sql"
);
const PERMISSION_MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260830014501_estimate_financial_persistence_permissions.sql"
);
const ROLLBACK = path.join(
  process.cwd(),
  "supabase/rollbacks/20260830014500_estimate_financial_persistence_hardening.rollback.sql"
);
const ROLLBACK_CHECK = path.join(process.cwd(), "scripts/check-rollback-sql.mjs");
const ESTIMATE_ID = "11111111-1111-4111-8111-111111111111";

const CANONICAL_PATCH = {
  customer_id: "22222222-2222-4222-8222-222222222222",
  client_name: "Ada Lovelace",
  client_phone: "808-555-0100",
  client_email: "ada@example.test",
  client_address: "1 Example Street",
  project_name: "Atomic Estimate",
  project_site_address: "2 Project Road",
  tax: 72.5,
  discount: 10,
  overhead_pct: 5,
  profit_pct: 10,
  estimate_date: "2026-08-30",
  valid_until: "2026-09-30",
  notes: "Persist all pricing fields together.",
  sales_person: "Owner",
};

function createCurrentHelperCompatibleClient() {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ estimate_id: ESTIMATE_ID, updated_at: "2026-08-30" }],
    error: null,
  });
  const directWrites: string[] = [];
  let table = "";
  let isUpdate = false;

  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => {
      isUpdate = true;
      directWrites.push(table);
      return builder;
    }),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({
      data: table === "estimates" ? { id: ESTIMATE_ID, status: "Draft" } : null,
      error: null,
    })),
    maybeSingle: vi.fn(async () => {
      if (isUpdate) return { data: { id: ESTIMATE_ID, estimate_id: ESTIMATE_ID }, error: null };
      if (table === "estimate_meta") return { data: { cost_category_names: {} }, error: null };
      return { data: null, error: null };
    }),
  };

  return {
    rpc,
    directWrites,
    from: vi.fn((nextTable: string) => {
      table = nextTable;
      isUpdate = false;
      return builder;
    }),
  };
}

function createRpcOnlyClient(result?: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(
    result ?? {
      data: [{ estimate_id: ESTIMATE_ID, updated_at: "2026-08-30" }],
      error: null,
    }
  );
  return {
    rpc,
    from: vi.fn(() => {
      throw new Error("Atomic Estimate meta persistence must not use direct table writes.");
    }),
  };
}

describe("Estimate meta atomic persistence contract", () => {
  it("sends the canonical meta patch in one atomic RPC instead of direct sequential writes", async () => {
    const db = createCurrentHelperCompatibleClient();

    await expect(
      updateEstimateMetaWithClient(db as never, ESTIMATE_ID, {
        customerId: "22222222-2222-4222-8222-222222222222",
        client: {
          name: "Ada Lovelace",
          phone: "808-555-0100",
          email: "ada@example.test",
          address: "1 Example Street",
        },
        project: { name: "Atomic Estimate", siteAddress: "2 Project Road" },
        tax: 72.5,
        discount: 10,
        overheadPct: 5,
        profitPct: 10,
        estimateDate: "2026-08-30",
        validUntil: "2026-09-30",
        notes: "Persist all pricing fields together.",
        salesPerson: "Owner",
      })
    ).resolves.toBe(true);

    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenCalledWith("update_estimate_meta_atomic", {
      p_estimate_id: ESTIMATE_ID,
      p_patch: CANONICAL_PATCH,
    });
    expect(db.directWrites).toEqual([]);
  });

  it("replays the same canonical patch without changing the request contract or using direct writes", async () => {
    const db = createCurrentHelperCompatibleClient();
    const payload = {
      tax: 72.5,
      discount: 10,
      notes: "Persist all pricing fields together.",
    };
    const patch = {
      tax: 72.5,
      discount: 10,
      notes: "Persist all pricing fields together.",
    };

    await expect(updateEstimateMetaWithClient(db as never, ESTIMATE_ID, payload)).resolves.toBe(
      true
    );
    await expect(updateEstimateMetaWithClient(db as never, ESTIMATE_ID, payload)).resolves.toBe(
      true
    );

    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(db.rpc).toHaveBeenNthCalledWith(1, "update_estimate_meta_atomic", {
      p_estimate_id: ESTIMATE_ID,
      p_patch: patch,
    });
    expect(db.rpc).toHaveBeenNthCalledWith(2, "update_estimate_meta_atomic", {
      p_estimate_id: ESTIMATE_ID,
      p_patch: patch,
    });
    expect(db.directWrites).toEqual([]);
  });

  it("preserves document metadata and category insertion order in the atomic patch", async () => {
    const db = createRpcOnlyClient();

    await expect(
      updateEstimateMetaWithClient(db as never, ESTIMATE_ID, {
        client: { address: "3 Client Lane" },
        documentStyle: "itemized",
        documentNotes: [
          {
            id: "note-1",
            type: "custom",
            title: "Scope",
            body: "Persisted atomically.",
          },
        ],
        categoryNames: {
          "020000": "First in proposal order",
          "010000": "First alphabetically, second in proposal order",
        },
      })
    ).resolves.toBe(true);

    expect(db.rpc).toHaveBeenCalledWith("update_estimate_meta_atomic", {
      p_estimate_id: ESTIMATE_ID,
      p_patch: {
        client_address: "3 Client Lane",
        project_site_address: "3 Client Lane",
        document_style: "itemized",
        document_notes: [
          {
            id: "note-1",
            type: "custom",
            title: "Scope",
            body: "Persisted atomically.",
          },
        ],
        category_names: [
          { cost_code: "020000", display_name: "First in proposal order" },
          { cost_code: "010000", display_name: "First alphabetically, second in proposal order" },
        ],
      },
    });
  });

  it.each([
    ["tax", Number.NaN],
    ["discount", Number.POSITIVE_INFINITY],
    ["overheadPct", Number.NEGATIVE_INFINITY],
  ] as const)("rejects a non-finite %s before calling the RPC", async (field, value) => {
    const db = createRpcOnlyClient();

    await expect(
      updateEstimateMetaWithClient(db as never, ESTIMATE_ID, { [field]: value })
    ).rejects.toThrow(/finite number/i);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("does not introduce a new sign rule for previously accepted finite values", async () => {
    const db = createRpcOnlyClient();

    await expect(
      updateEstimateMetaWithClient(db as never, ESTIMATE_ID, { tax: -1, discount: -2 })
    ).resolves.toBe(true);
    expect(db.rpc).toHaveBeenCalledWith("update_estimate_meta_atomic", {
      p_estimate_id: ESTIMATE_ID,
      p_patch: { tax: -1, discount: -2 },
    });
  });

  it("reports an RPC failure as failure and never falls back to direct writes", async () => {
    const db = createRpcOnlyClient({
      data: null,
      error: { message: "forced atomic write failure" },
    });

    await expect(
      updateEstimateMetaWithClient(db as never, ESTIMATE_ID, { tax: 48.06 })
    ).resolves.toBe(false);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("defines the service-role-only atomic Estimate financial persistence migration", () => {
    expect(fs.existsSync(MIGRATION), `${MIGRATION} must be checked in`).toBe(true);
    expect(fs.existsSync(PERMISSION_MIGRATION), `${PERMISSION_MIGRATION} must be checked in`).toBe(
      true
    );
    const sql = `${fs.readFileSync(MIGRATION, "utf8")}\n${fs.readFileSync(
      PERMISSION_MIGRATION,
      "utf8"
    )}`;

    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.update_estimate_meta_atomic/i);
    expect(sql).toMatch(/from\s+public\.estimates[\s\S]*for\s+update/i);
    expect(sql).toMatch(/['"]Draft['"][\s\S]*['"]Sent['"]/i);
    expect(sql).toMatch(/update\s+public\.estimates/i);
    expect(sql).toMatch(/update\s+public\.estimate_meta/i);
    expect(sql).toMatch(
      /insert\s+into\s+public\.estimate_categories|update\s+public\.estimate_categories/i
    );
    expect(sql).toMatch(/finite|isfinite|invalid.*(?:tax|discount)/i);
    expect(sql).toMatch(/jsonb_array_elements[\s\S]*with\s+ordinality/i);
    expect(sql).toMatch(/count\(\*\)\s*<>\s*count\(distinct/i);
    expect(sql).toMatch(/security\s+invoker/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*''/i);
    expect(sql).not.toMatch(/security\s+definer/i);
    expect(sql).toMatch(/revoke\s+all[^;]*from\s+public/i);
    expect(sql).toMatch(/revoke\s+all[^;]*from\s+anon/i);
    expect(sql).toMatch(/revoke\s+all[^;]*from\s+authenticated/i);
    expect(sql).toMatch(/revoke\s+all[^;]*from\s+service_role/i);
    expect(sql).toMatch(/grant\s+execute[\s\S]*to\s+service_role/i);
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete|all)[\s\S]{0,200}\bto\s+authenticated/i
    );
  });

  it("ships a data-preserving rollback that only removes the atomic RPC", () => {
    expect(fs.existsSync(ROLLBACK), `${ROLLBACK} must be checked in`).toBe(true);
    const sql = fs.readFileSync(ROLLBACK, "utf8");

    expect(sql).toMatch(/drop\s+function\s+if\s+exists\s+public\.update_estimate_meta_atomic/i);
    expect(sql).toMatch(/notify\s+pgrst,\s*['"]reload schema['"]/i);
    expect(sql).not.toMatch(
      /\b(?:insert\s+into|update\s+public|delete\s+from|truncate|alter\s+table)\b/i
    );

    const probe = fs.readFileSync(ROLLBACK_CHECK, "utf8");
    expect(probe).toContain("20260830014500_estimate_financial_persistence_hardening.rollback.sql");
    expect(probe).toMatch(/to_regprocedure[\s\S]*update_estimate_meta_atomic/i);
  });
});
