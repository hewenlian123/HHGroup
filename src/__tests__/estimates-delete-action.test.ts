import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SNAPSHOT_DELETE_RESTRICT_MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260830120000_estimate_snapshot_delete_restrict.sql"
);
const ROLLBACK_CHECK = path.join(process.cwd(), "scripts/check-rollback-sql.mjs");

const revalidatePathMock = vi.fn();
const getServerSupabaseAdminMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: getServerSupabaseAdminMock,
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerAction: async () => ({
    ok: true as const,
    context: { email: "owner@example.com", role: "owner", user: { id: "owner-1" } },
  }),
}));

describe("deleteEstimateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDeleteFlow({
    deleteData,
    deleteError = null,
    postDeleteData,
    postDeleteError = null,
    childDeleteErrors = {},
    status = "Draft",
    projectDependencies = [],
    snapshotDependencies = [],
    scheduleDependencies = [],
  }: {
    deleteData: Array<{ id: string }> | null;
    deleteError?: { message: string; code?: string } | null;
    postDeleteData: { id: string } | null;
    postDeleteError?: { message: string; code?: string } | null;
    childDeleteErrors?: Record<string, { message: string; code?: string }>;
    status?: string;
    projectDependencies?: Array<Record<string, unknown>>;
    snapshotDependencies?: Array<Record<string, unknown>>;
    scheduleDependencies?: Array<Record<string, unknown>>;
  }) {
    const estimateId = deleteData?.[0]?.id ?? postDeleteData?.id ?? "estimate-test";
    const deleteByTable: Record<string, ReturnType<typeof vi.fn>> = {};
    const buildDeleteResult = (table: string) => {
      const deleteFn = vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            abortSignal: vi
              .fn()
              .mockResolvedValue(
                table === "estimates"
                  ? { data: deleteData, error: deleteError }
                  : { data: [], error: childDeleteErrors[table] ?? null }
              ),
          })),
        })),
      }));
      deleteByTable[table] = deleteFn;
      return { delete: deleteFn };
    };
    const buildEstimateResult = () => ({
      ...buildDeleteResult("estimates"),
      select: vi.fn((columns: string) => ({
        eq: vi.fn(() => ({
          abortSignal: vi.fn(() => ({
            maybeSingle: vi
              .fn()
              .mockResolvedValue(
                columns.includes("status")
                  ? { data: { id: estimateId, status }, error: null }
                  : { data: postDeleteData, error: postDeleteError }
              ),
          })),
        })),
      })),
    });
    const from = vi.fn((table: string) => {
      if (table === "estimates") return buildEstimateResult();
      const deleteResult = buildDeleteResult(table);
      const dependencyData =
        table === "projects"
          ? projectDependencies
          : table === "estimate_snapshots"
            ? snapshotDependencies
            : table === "estimate_payment_schedule_items"
              ? scheduleDependencies
              : [];
      return {
        ...deleteResult,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              abortSignal: vi.fn().mockResolvedValue({ data: dependencyData, error: null }),
            })),
            abortSignal: vi.fn().mockResolvedValue({ data: dependencyData, error: null }),
          })),
        })),
      };
    });
    getServerSupabaseAdminMock.mockReturnValue({ from });
    return { from, deleteByTable };
  }

  it("does not report success when no estimate row was deleted", async () => {
    mockDeleteFlow({ deleteData: [], postDeleteData: null });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", "00000000-0000-0000-0000-000000000000");

    const result = await deleteEstimateAction(formData);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not deleted/i);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("enforces protected snapshot history with a database-level restrictive foreign key", () => {
    expect(
      fs.existsSync(SNAPSHOT_DELETE_RESTRICT_MIGRATION),
      `${SNAPSHOT_DELETE_RESTRICT_MIGRATION} must be checked in`
    ).toBe(true);
    const sql = fs.readFileSync(SNAPSHOT_DELETE_RESTRICT_MIGRATION, "utf8");
    expect(sql).toMatch(
      /add\s+constraint\s+estimate_snapshots_estimate_id_fkey[\s\S]*references\s+public\.estimates\s*\(id\)[\s\S]*on\s+delete\s+restrict/i
    );
    expect(sql).not.toMatch(
      /add\s+constraint\s+estimate_snapshots_estimate_id_fkey[\s\S]*on\s+delete\s+cascade/i
    );
    expect(sql).toMatch(
      /begin;[\s\S]*drop\s+constraint\s+if\s+exists\s+estimate_snapshots_estimate_id_fkey;[\s\S]*add\s+constraint\s+estimate_snapshots_estimate_id_fkey[\s\S]*not\s+valid;[\s\S]*commit;/i
    );
    expect(sql).toMatch(
      /commit;[\s\S]*begin;[\s\S]*validate\s+constraint\s+estimate_snapshots_estimate_id_fkey;[\s\S]*commit;/i
    );

    const probe = fs.readFileSync(ROLLBACK_CHECK, "utf8");
    expect(probe).toContain("20260830120000_estimate_snapshot_delete_restrict.rollback.sql");
    expect(probe).toMatch(/estimate_snapshots_estimate_id_fkey[\s\S]*confdeltype/i);
    expect(probe).toMatch(/estimate_snapshots_estimate_id_fkey[\s\S]*convalidated/i);
  });

  it("revalidates list and detail surfaces after deleting an estimate", async () => {
    const estimateId = "11111111-1111-1111-1111-111111111111";
    const { deleteByTable } = mockDeleteFlow({
      deleteData: [{ id: estimateId }],
      postDeleteData: null,
    });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", estimateId);

    const result = await deleteEstimateAction(formData);

    expect(result).toMatchObject({
      ok: true,
      diagnostic: {
        estimateId,
        deletedRowCount: 1,
        deletedRowIds: [estimateId],
        postDeleteExists: false,
        postDeleteId: null,
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}/preview`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}/print`);
    expect(deleteByTable.estimate_snapshots).not.toHaveBeenCalled();
  });

  it("does not report success when post-delete verification still finds the estimate row", async () => {
    const estimateId = "22222222-2222-2222-2222-222222222222";
    mockDeleteFlow({
      deleteData: [{ id: estimateId }],
      postDeleteData: { id: estimateId },
    });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", estimateId);

    const result = await deleteEstimateAction(formData);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/still exists/i);
    expect(result.diagnostic).toMatchObject({
      estimateId,
      deletedRowCount: 1,
      deletedRowIds: [estimateId],
      postDeleteExists: true,
      postDeleteId: estimateId,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not delete the estimate when related row cleanup fails", async () => {
    const estimateId = "33333333-3333-3333-3333-333333333333";
    const { deleteByTable } = mockDeleteFlow({
      deleteData: [{ id: estimateId }],
      postDeleteData: null,
      childDeleteErrors: {
        estimate_payment_schedule_items: { message: "permission denied", code: "42501" },
      },
    });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", estimateId);

    const result = await deleteEstimateAction(formData);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Database operation failed.");
    expect(deleteByTable.estimates).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not delete any rows when the estimate is Approved", async () => {
    const { deleteByTable } = mockDeleteFlow({
      deleteData: [{ id: "approved-1" }],
      postDeleteData: { id: "approved-1" },
      status: "Approved",
    });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", "approved-1");

    const result = await deleteEstimateAction(formData);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/approved estimates.*cannot be deleted/i);
    expect(Object.values(deleteByTable).every((deleteFn) => !deleteFn.mock.calls.length)).toBe(
      true
    );
  });

  it.each(["Sent", "Rejected", "Converted"])(
    "blocks hard delete for a %s estimate",
    async (status) => {
      const { deleteByTable } = mockDeleteFlow({
        deleteData: [{ id: "protected-1" }],
        postDeleteData: { id: "protected-1" },
        status,
      });
      const { deleteEstimateAction } = await import("@/app/estimates/actions");
      const formData = new FormData();
      formData.set("estimateId", "protected-1");

      const result = await deleteEstimateAction(formData);

      expect(result.error).toContain(`${status} estimates cannot be deleted`);
      expect(Object.values(deleteByTable).every((deleteFn) => !deleteFn.mock.calls.length)).toBe(
        true
      );
    }
  );

  it.each([
    {
      label: "linked project",
      options: { projectDependencies: [{ id: "project-1" }] },
      message: /linked to a project/i,
    },
    {
      label: "protected snapshot history",
      options: { snapshotDependencies: [{ id: "snapshot-1" }] },
      message: /protected version history/i,
    },
    {
      label: "invoiced payment milestone",
      options: {
        scheduleDependencies: [{ id: "milestone-1", status: "invoiced", invoice_id: "invoice-1" }],
      },
      message: /invoiced or paid payment milestone/i,
    },
  ])("blocks a Draft estimate with $label", async ({ options, message }) => {
    const { deleteByTable } = mockDeleteFlow({
      deleteData: [{ id: "draft-protected-1" }],
      postDeleteData: { id: "draft-protected-1" },
      ...options,
    });
    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", "draft-protected-1");

    const result = await deleteEstimateAction(formData);

    expect(result.error).toMatch(message);
    expect(Object.values(deleteByTable).every((deleteFn) => !deleteFn.mock.calls.length)).toBe(
      true
    );
  });
});
