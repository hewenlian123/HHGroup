import { describe, expect, it } from "vitest";
import {
  applyApBillLinkToSchedule,
  buildApBillDraftFromSchedule,
  buildSubcontractScheduleInsert,
  ensureScheduleCanCreateApBill,
} from "@/lib/subcontract-ap-linkage";

describe("subcontract AP linkage helpers", () => {
  it("normalizes a schedule item insert without creating actual project cost", () => {
    const draft = buildSubcontractScheduleInsert({
      subcontractId: "subcontract-1",
      projectId: "project-1",
      subcontractorId: "subcontractor-1",
      title: "Rough electrical",
      description: "Milestone 1",
      amount: 1200.456,
      dueDate: "2026-06-15T12:00:00Z",
    });

    expect(draft).toEqual({
      subcontract_id: "subcontract-1",
      project_id: "project-1",
      subcontractor_id: "subcontractor-1",
      title: "Rough electrical",
      description: "Milestone 1",
      amount: 1200.46,
      due_date: "2026-06-15",
      status: "draft",
    });
  });

  it("builds an AP bill draft from a schedule item and subcontract context", () => {
    const billDraft = buildApBillDraftFromSchedule({
      schedule: {
        id: "schedule-1",
        subcontract_id: "subcontract-1",
        project_id: "project-1",
        subcontractor_id: "subcontractor-1",
        title: "Trim install",
        amount: 2500,
        due_date: "2026-07-01",
        status: "draft",
        ap_bill_id: null,
      },
      subcontractorName: "Aloha Finish Carpentry",
      subcontractDescription: "Finish carpentry package",
    });

    expect(billDraft).toEqual(
      expect.objectContaining({
        bill_type: "Vendor",
        vendor_name: "Aloha Finish Carpentry",
        project_id: "project-1",
        subcontractor_id: "subcontractor-1",
        subcontract_id: "subcontract-1",
        due_date: "2026-07-01",
        amount: 2500,
        category: "Subcontract",
      })
    );
    expect(billDraft.notes).toContain("Finish carpentry package");
    expect(billDraft.notes).toContain("Trim install");
  });

  it("blocks duplicate AP bill creation when the schedule item is already linked", () => {
    expect(() =>
      ensureScheduleCanCreateApBill({
        id: "schedule-1",
        status: "billed",
        ap_bill_id: "ap-1",
      })
    ).toThrow(/already has an AP bill/i);
  });

  it("marks the schedule item billed after AP bill creation", () => {
    expect(applyApBillLinkToSchedule("ap-1")).toEqual({
      status: "billed",
      ap_bill_id: "ap-1",
    });
  });
});
