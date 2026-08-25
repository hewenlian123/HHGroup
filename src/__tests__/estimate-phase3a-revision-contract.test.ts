import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEstimateRevisionWithClient,
  getEstimateRevisionContextWithClient,
} from "@/lib/estimates-db";

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
  "supabase/migrations/20260822230000_estimate_revision_immutable_lineage.sql"
);
const DETAIL_HEADER = path.join(process.cwd(), "src/app/estimates/[id]/estimate-detail-header.tsx");
const DETAIL_CLIENT = path.join(process.cwd(), "src/app/estimates/[id]/estimate-detail-client.tsx");
const DETAIL_ACTIONS = path.join(process.cwd(), "src/app/estimates/[id]/actions.ts");

describe("Estimate Phase 3A revision contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerOrAdminMock.mockResolvedValue({
      ok: true,
      context: { email: "owner@example.com", role: "owner", user: { id: ACTOR.userId } },
    });
  });

  it("sends only the authoritative source id to the atomic revision RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          estimate_id: "22222222-2222-4222-8222-222222222222",
          estimate_number: "EST-0053",
          revision_number: 1,
        },
      ],
      error: null,
    });

    const result = await createEstimateRevisionWithClient(
      { rpc } as never,
      "11111111-1111-4111-8111-111111111111",
      ACTOR
    );

    expect(rpc).toHaveBeenCalledWith("create_estimate_revision", {
      p_source_estimate_id: "11111111-1111-4111-8111-111111111111",
      p_actor_user_id: ACTOR.userId,
      p_actor_label: ACTOR.label,
    });
    expect(result).toEqual({
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNumber: "EST-0053",
      revisionNumber: 1,
    });
  });

  it("authorizes revision creation before the RPC and returns the new Draft identity", async () => {
    const sourceId = "11111111-1111-4111-8111-111111111111";
    const revisionId = "22222222-2222-4222-8222-222222222222";
    const rpc = vi.fn().mockResolvedValue({
      data: [{ estimate_id: revisionId, estimate_number: "EST-0053", revision_number: 1 }],
      error: null,
    });
    getServerSupabaseAdminMock.mockReturnValue({ rpc });

    const { createEstimateRevisionAction } = await import("@/app/estimates/actions");
    const result = await createEstimateRevisionAction(sourceId);

    expect(result).toEqual({
      ok: true,
      estimateId: revisionId,
      estimateNumber: "EST-0053",
      revisionNumber: 1,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${sourceId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${revisionId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates");
  });

  it("does not expose revision creation to an unauthenticated caller", async () => {
    requireOwnerOrAdminMock.mockResolvedValue({ ok: false });
    const rpc = vi.fn();
    getServerSupabaseAdminMock.mockReturnValue({ rpc });

    const { createEstimateRevisionAction } = await import("@/app/estimates/actions");
    const result = await createEstimateRevisionAction("11111111-1111-4111-8111-111111111111");

    expect(result).toEqual({ ok: false, error: "Authentication required." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("defines immutable, concurrency-safe lineage and preserves the shared copy contract", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");

    expect(sql).toMatch(/add column if not exists revision_root_id uuid/i);
    expect(sql).toMatch(/add column if not exists revision_number integer/i);
    expect(sql).toMatch(/add column if not exists previous_revision_id uuid/i);
    expect(sql).toMatch(/unique \(revision_root_id, revision_number\)/i);
    expect(sql).toMatch(/unique \(number, revision_number\)/i);
    expect(sql).toMatch(/unique \(previous_revision_id\)/i);
    expect(sql).toMatch(/prevent_estimate_lineage_mutation/i);
    expect(sql).toMatch(/create or replace function public\.copy_estimate_as_draft_core/i);
    expect(sql).toMatch(/create or replace function public\.duplicate_estimate_as_draft/i);
    expect(sql).toMatch(/create or replace function public\.create_estimate_revision/i);
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/status not in \('Approved', 'Rejected', 'Converted'\)/i);
    expect(sql).toMatch(/latest revision/i);
    expect(sql).toMatch(/p\.amount,[\s\S]*null::date,[\s\S]*'draft',[\s\S]*null/i);
    expect(sql).toMatch(/grant execute[\s\S]*create_estimate_revision[\s\S]*to service_role/i);
    expect(sql).toMatch(/revoke all[\s\S]*create_estimate_revision[\s\S]*from authenticated/i);
  });

  it("identifies a historical source and the authoritative current revision", async () => {
    const sourceSingle = vi.fn().mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        number: "EST-0053",
        revision_root_id: "11111111-1111-4111-8111-111111111111",
        revision_number: 0,
        previous_revision_id: null,
      },
      error: null,
    });
    const familyOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          revision_number: 1,
          status: "Draft",
          created_at: "2026-08-24T10:00:00.000Z",
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          revision_number: 0,
          status: "Approved",
          created_at: "2026-08-23T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: sourceSingle })) })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: familyOrder })),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                estimate_id: "22222222-2222-4222-8222-222222222222",
                tax: 50,
                discount: 25,
              },
              {
                estimate_id: "11111111-1111-4111-8111-111111111111",
                tax: 0,
                discount: 0,
              },
            ],
            error: null,
          }),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                estimate_id: "22222222-2222-4222-8222-222222222222",
                qty: 2,
                unit_cost: 500,
              },
              {
                estimate_id: "11111111-1111-4111-8111-111111111111",
                qty: 1,
                unit_cost: 750,
              },
            ],
            error: null,
          }),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    estimate_id: "22222222-2222-4222-8222-222222222222",
                    actor_label: "Owner Example",
                    occurred_at: "2026-08-24T10:00:00.000Z",
                  },
                ],
                error: null,
              }),
            })),
          })),
        })),
      });

    const context = await getEstimateRevisionContextWithClient(
      { from } as never,
      "11111111-1111-4111-8111-111111111111"
    );

    expect(context).toEqual({
      revisionRootId: "11111111-1111-4111-8111-111111111111",
      estimateNumber: "EST-0053",
      revisionNumber: 0,
      revisions: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          revisionNumber: 1,
          status: "Draft",
          createdAt: "2026-08-24T10:00:00.000Z",
          createdBy: "Owner Example",
          total: 1025,
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          revisionNumber: 0,
          status: "Approved",
          createdAt: "2026-08-23T10:00:00.000Z",
          createdBy: null,
          total: 750,
        },
      ],
      previousRevisionId: null,
      previousRevisionNumber: null,
      nextRevisionId: "22222222-2222-4222-8222-222222222222",
      nextRevisionNumber: 1,
      currentRevisionId: "22222222-2222-4222-8222-222222222222",
      currentRevisionNumber: 1,
      isCurrent: false,
    });
  });

  it("fails closed when revision total source rows cannot be read", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const from = vi
      .fn()
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id,
                number: "EST-0053",
                revision_root_id: id,
                revision_number: 0,
                previous_revision_id: null,
              },
              error: null,
            }),
          })),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id,
                  revision_number: 0,
                  status: "Draft",
                  created_at: "2026-08-24T10:00:00.000Z",
                },
              ],
              error: null,
            }),
          })),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: [{ estimate_id: id, tax: 50, discount: 25 }],
            error: null,
          }),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "items unavailable" },
          }),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } }),
            })),
          })),
        })),
      });

    const context = await getEstimateRevisionContextWithClient({ from } as never, id);

    expect(context?.revisions[0]).toMatchObject({ total: null, createdBy: null });
  });

  it("exposes Create Revision navigation and removes the legacy reopen-in-place action", () => {
    const header = fs.readFileSync(DETAIL_HEADER, "utf8");
    const detail = fs.readFileSync(DETAIL_CLIENT, "utf8");
    const actions = fs.readFileSync(DETAIL_ACTIONS, "utf8");

    expect(header).toContain("Create Revision");
    expect(header).toContain("Previous revision");
    expect(header).toContain("Current revision");
    expect(header).toContain('label: "Estimate date"');
    expect(header).toContain('label: "Valid until"');
    expect(header).toContain("formatEstimateCurrency(grandTotal)");
    expect(header).toContain('data-testid="create-estimate-revision-action"');
    expect(detail).toContain("revisionContext.revisions.map");
    expect(detail).toContain('data-testid="estimate-revision-family-list"');
    expect(detail).toContain("formatRevisionDate(revision.createdAt)");
    expect(detail).toContain("revision.createdBy");
    expect(detail).toContain("formatEstimateCurrency(revision.total)");
    expect(actions).not.toContain("createNewVersionAction");
    expect(actions).not.toContain("createNewVersionFromSnapshot");
  });
});
