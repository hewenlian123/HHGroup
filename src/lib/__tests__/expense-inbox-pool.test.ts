import type { Expense } from "@/lib/data";
import { describe, expect, it } from "vitest";
import {
  countExpensesMatchingInboxPool,
  deriveExpenseWorkflowStatus,
  expenseMatchesExpensesArchivePool,
  expenseMatchesInboxPool,
  validateApproveInboxUploadDraft,
} from "@/lib/expense-workflow-status";

/** Test overrides may use legacy / string DB statuses not in the typed union. */
type MockExpenseOverrides = Omit<Partial<Expense>, "status"> & { status?: string | null };

function mockExpense(over: MockExpenseOverrides): Expense {
  return {
    id: "e1",
    date: "2026-01-01",
    vendorName: "Acme",
    paymentMethod: "Cash",
    attachments: [],
    lines: [
      {
        id: "l1",
        projectId: "proj-1",
        category: "Materials",
        amount: 12.34,
        memo: null,
      },
    ],
    headerProjectId: null,
    status: "needs_review",
    sourceType: "company",
    receiptUrl: "https://example.test/storage/v1/object/public/receipts/x.jpg",
    ...over,
  } as Expense;
}

describe("expenseMatchesInboxPool", () => {
  it("includes needs_review even when receipt and classification exist", () => {
    expect(expenseMatchesInboxPool(mockExpense({ status: "needs_review" }), false)).toBe(true);
  });

  it("includes pending and unreviewed", () => {
    expect(expenseMatchesInboxPool(mockExpense({ status: "pending" }), false)).toBe(true);
    expect(expenseMatchesInboxPool(mockExpense({ status: "unreviewed" }), false)).toBe(true);
  });

  it("includes empty status as incomplete / unreviewed", () => {
    expect(expenseMatchesInboxPool(mockExpense({ status: undefined }), false)).toBe(true);
    expect(expenseMatchesInboxPool(mockExpense({ status: "" }), false)).toBe(true);
  });

  it("excludes reviewed row with receipt, project, category, and payment (Done)", () => {
    const e = mockExpense({ status: "reviewed" });
    expect(expenseMatchesInboxPool(e, false)).toBe(false);
    expect(expenseMatchesInboxPool(e, true)).toBe(false);
  });

  it("does not force Done-complete rows in via duplicate hint alone", () => {
    const e = mockExpense({ status: "reviewed" });
    expect(expenseMatchesInboxPool(e, true)).toBe(false);
  });

  it("excludes Done + missing receipt from Inbox", () => {
    expect(
      expenseMatchesInboxPool(
        mockExpense({ status: "reviewed", receiptUrl: null, attachments: [] }),
        false
      )
    ).toBe(false);
  });

  it("excludes Done + missing payment from Inbox", () => {
    expect(
      expenseMatchesInboxPool(mockExpense({ status: "reviewed", paymentMethod: "" }), false)
    ).toBe(false);
  });

  it("excludes Done + missing project from Inbox", () => {
    expect(
      expenseMatchesInboxPool(
        mockExpense({
          status: "reviewed",
          lines: [{ id: "l1", projectId: null, category: "Materials", amount: 1, memo: null }],
        }),
        false
      )
    ).toBe(false);
  });

  it("allows Done overhead rows without project into Expenses archive", () => {
    const e = mockExpense({
      status: "reviewed",
      lines: [{ id: "l1", projectId: null, category: "Fuel", amount: 1, memo: null }],
    });
    expect(expenseMatchesInboxPool(e, false)).toBe(false);
    expect(expenseMatchesExpensesArchivePool(e)).toBe(true);
  });

  it("excludes Done + missing category from Inbox", () => {
    expect(
      expenseMatchesInboxPool(
        mockExpense({
          status: "done",
          lines: [{ id: "l1", projectId: "proj-1", category: "", amount: 1, memo: null }],
        }),
        false
      )
    ).toBe(false);
  });

  it("excludes completed-like DB status from Inbox", () => {
    expect(expenseMatchesInboxPool(mockExpense({ status: "completed" }), false)).toBe(false);
    expect(expenseMatchesInboxPool(mockExpense({ status: "paid" }), false)).toBe(false);
  });

  it("excludes Done + duplicateHint from Inbox", () => {
    expect(expenseMatchesInboxPool(mockExpense({ status: "reviewed" }), true)).toBe(false);
  });
});

describe("expense project requirement workflow", () => {
  it("uses explicit overhead cost allocation, not category, to allow no-project expenses", () => {
    expect(deriveExpenseWorkflowStatus(null, "Materials", "overhead")).toBe("reviewed");
    expect(deriveExpenseWorkflowStatus(null, "Fuel", "overhead")).toBe("reviewed");
  });

  it("uses explicit project-cost allocation, not category, to require a project", () => {
    expect(deriveExpenseWorkflowStatus(null, "Fuel", "project_cost")).toBe("needs_review");
    expect(deriveExpenseWorkflowStatus(null, "Materials", "project_cost")).toBe("needs_review");
    expect(deriveExpenseWorkflowStatus("proj-1", "Fuel", "project_cost")).toBe("reviewed");
  });

  it("allows overhead approval without project regardless of payment source or worker", () => {
    expect(
      validateApproveInboxUploadDraft(
        mockExpense({
          referenceNo: "INBOX-UP-test",
          paymentAccountId: "pay-1",
          lines: [{ id: "l1", projectId: null, category: "Materials", amount: 1, memo: null }],
        }),
        "overhead"
      )
    ).toBeNull();

    expect(
      validateApproveInboxUploadDraft(
        mockExpense({
          referenceNo: "INBOX-UP-test",
          sourceType: "reimbursement",
          workerId: "worker-1",
          paymentAccountId: null,
          lines: [{ id: "l1", projectId: null, category: "Materials", amount: 1, memo: null }],
        }),
        "overhead"
      )
    ).toBeNull();
  });

  it("requires worker, not payment account, for worker reimbursement approval", () => {
    expect(
      validateApproveInboxUploadDraft(
        mockExpense({
          referenceNo: "INBOX-UP-test",
          sourceType: "reimbursement",
          workerId: null,
          paymentAccountId: null,
          lines: [{ id: "l1", projectId: null, category: "Fuel", amount: 1, memo: null }],
        }),
        "overhead"
      )
    ).toBe("worker");

    expect(
      validateApproveInboxUploadDraft(
        mockExpense({
          referenceNo: "INBOX-UP-test",
          sourceType: "company",
          workerId: "worker-1",
          paymentAccountId: null,
          lines: [{ id: "l1", projectId: null, category: "Fuel", amount: 1, memo: null }],
        }),
        "overhead"
      )
    ).toBe("payment");
  });

  it("blocks project-cost approval without project regardless of payment source or worker", () => {
    expect(
      validateApproveInboxUploadDraft(
        mockExpense({
          referenceNo: "INBOX-UP-test",
          paymentAccountId: "pay-1",
          lines: [{ id: "l1", projectId: null, category: "Fuel", amount: 1, memo: null }],
        }),
        "project_cost"
      )
    ).toBe("project");

    expect(
      validateApproveInboxUploadDraft(
        mockExpense({
          referenceNo: "INBOX-UP-test",
          sourceType: "reimbursement",
          workerId: "worker-1",
          paymentAccountId: "pay-1",
          lines: [{ id: "l1", projectId: null, category: "Fuel", amount: 1, memo: null }],
        }),
        "project_cost"
      )
    ).toBe("project");
  });
});

describe("countExpensesMatchingInboxPool", () => {
  it("matches per-row expenseMatchesInboxPool", () => {
    const rows = [
      mockExpense({ id: "a", status: "needs_review" }),
      mockExpense({ id: "b", status: "reviewed" }),
      mockExpense({ id: "c", status: "pending" }),
    ];
    expect(countExpensesMatchingInboxPool(rows)).toBe(2);
  });
});
