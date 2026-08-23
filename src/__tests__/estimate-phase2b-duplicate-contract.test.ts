import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { duplicateEstimateAsDraftWithClient } from "@/lib/estimates-db";

const ACTOR = {
  userId: "33333333-3333-4333-8333-333333333333",
  label: "owner@example.com",
};

const revalidatePathMock = vi.fn();
const getServerSupabaseAdminMock = vi.fn();
const requireOwnerOrAdminMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: getServerSupabaseAdminMock,
}));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerAction: requireOwnerOrAdminMock,
}));

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260822150000_duplicate_estimate_atomic_deep_copy.sql"
);

describe("Estimate Phase 2B duplicate contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerOrAdminMock.mockResolvedValue({
      ok: true,
      context: { email: "owner@example.com", role: "owner", user: { id: ACTOR.userId } },
    });
  });

  it("sends only the canonical source Estimate id to the shared atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          estimate_id: "22222222-2222-4222-8222-222222222222",
          estimate_number: "EST-0200",
        },
      ],
      error: null,
    });

    const result = await duplicateEstimateAsDraftWithClient(
      { rpc } as never,
      "11111111-1111-4111-8111-111111111111",
      ACTOR
    );

    expect(rpc).toHaveBeenCalledWith("duplicate_estimate_as_draft", {
      p_source_estimate_id: "11111111-1111-4111-8111-111111111111",
      p_actor_user_id: ACTOR.userId,
      p_actor_label: ACTOR.label,
    });
    expect(result).toEqual({
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNumber: "EST-0200",
    });
  });

  it("authorizes the shared copy action before invoking the RPC", async () => {
    requireOwnerOrAdminMock.mockResolvedValue({ ok: false });
    const rpc = vi.fn();
    getServerSupabaseAdminMock.mockReturnValue({ rpc });

    const { duplicateEstimateAsDraftAction } = await import("@/app/estimates/actions");
    const result = await duplicateEstimateAsDraftAction("11111111-1111-4111-8111-111111111111");

    expect(result).toEqual({ ok: false, error: "Authentication required." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the new canonical id and number and revalidates both records", async () => {
    const sourceId = "11111111-1111-4111-8111-111111111111";
    const duplicateId = "22222222-2222-4222-8222-222222222222";
    const rpc = vi.fn().mockResolvedValue({
      data: [{ estimate_id: duplicateId, estimate_number: "EST-0201" }],
      error: null,
    });
    getServerSupabaseAdminMock.mockReturnValue({ rpc });

    const { duplicateEstimateAsDraftAction } = await import("@/app/estimates/actions");
    const result = await duplicateEstimateAsDraftAction(sourceId);

    expect(result).toEqual({
      ok: true,
      estimateId: duplicateId,
      estimateNumber: "EST-0201",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${sourceId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${duplicateId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates");
  });

  it("defines an atomic Draft copy that preserves content and resets downstream state", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");

    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.duplicate_estimate_as_draft/i);
    expect(sql).toMatch(/from\s+public\.estimates[\s\S]*for\s+share/i);
    expect(sql).toMatch(/public\.next_estimate_number\(\)/i);
    expect(sql).toMatch(/'Draft',[\s\S]*null,[\s\S]*v_source\.customer_id/i);
    expect(sql).toMatch(/insert\s+into\s+public\.estimate_meta/i);
    expect(sql).toMatch(/cost_category_names[\s\S]*document_notes/i);
    expect(sql).toMatch(/current_timestamp\s+at\s+time\s+zone\s+'UTC'/i);
    expect(sql).toMatch(/validity remains unset[\s\S]*null::date/i);
    expect(sql).toMatch(/insert\s+into\s+public\.estimate_categories/i);
    expect(sql).toMatch(/insert\s+into\s+public\.estimate_items/i);
    expect(sql).toMatch(/i\.status[\s\S]*i\.hide_amount_on_pdf/i);
    expect(sql).toMatch(/v_schedule_total\s*>\s*v_estimate_total/i);
    expect(sql).toMatch(
      /historical[\s\S]*due dates are cleared[\s\S]*null::date,[\s\S]*'draft',[\s\S]*null/i
    );
    expect(sql).toMatch(/grant\s+execute[\s\S]*to\s+service_role/i);
    expect(sql).toMatch(/revoke\s+all[\s\S]*from\s+authenticated/i);
  });
});
