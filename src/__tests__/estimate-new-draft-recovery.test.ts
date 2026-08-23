import { describe, expect, it } from "vitest";

import {
  ESTIMATE_NEW_DRAFT_STORAGE_KEY,
  ESTIMATE_NEW_DRAFT_VERSION,
  clearEstimateNewDraftRecovery,
  isMeaningfulEstimateNewDraft,
  parseEstimateNewDraftRecovery,
  recoveryCandidateState,
  writeEstimateNewDraftRecovery,
  type EstimateNewDraftData,
} from "@/lib/estimate-new-draft-recovery";

function draft(): EstimateNewDraftData {
  return {
    clientName: "Recovery Client",
    projectName: "Recovery Project",
    address: "1 Recovery Way",
    phone: "808-555-0100",
    email: "recovery@example.com",
    selectedCustomer: { id: "customer-1", name: "Recovery Client" },
    estimateDate: "2026-08-22",
    validUntil: "2026-09-22",
    salesPerson: "Estimator",
    tax: 123.45,
    taxTouched: true,
    templateDefaultTaxPct: 4.712,
    discount: 67.89,
    documentStyle: "itemized",
    categoryNames: { section_a: "Site Work" },
    sectionOrder: ["section_a"],
    lineItems: [
      {
        id: "line-1",
        costCode: "section_a",
        title: "Mobilization",
        description: "Preserve every supported field",
        qty: 2.5,
        unit: "LS",
        unitPrice: 1000.25,
        hideAmountOnPdf: true,
        status: "allowance",
      },
    ],
    estimateNotes: [
      { id: "note-1", type: "custom", title: "Clarification", body: "Keep this note." },
    ],
    paymentMilestones: [
      {
        id: "milestone-1",
        title: "Deposit",
        description: "Tax-inclusive fixed amount",
        amount: 2556.19,
        dueDate: "2026-08-30",
      },
    ],
    selectedTemplateId: "template-1",
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("new Estimate draft recovery", () => {
  it("round-trips supported content without recalculating financial values", () => {
    const storage = memoryStorage();
    const source = draft();
    const envelope = writeEstimateNewDraftRecovery(source, 1234, storage);
    expect(envelope?.version).toBe(ESTIMATE_NEW_DRAFT_VERSION);

    const parsed = parseEstimateNewDraftRecovery(storage.getItem(ESTIMATE_NEW_DRAFT_STORAGE_KEY));
    expect(parsed.state).toBe("recoverable");
    if (parsed.state !== "recoverable") throw new Error("Expected recoverable draft");
    expect(parsed.envelope.draft).toEqual(source);
    expect(parsed.envelope.draft.tax).toBe(123.45);
    expect(parsed.envelope.draft.discount).toBe(67.89);
    expect(parsed.envelope.draft.paymentMilestones[0]?.amount).toBe(2556.19);
  });

  it("classifies incompatible data as stale instead of applying it", () => {
    expect(
      parseEstimateNewDraftRecovery(
        JSON.stringify({ version: ESTIMATE_NEW_DRAFT_VERSION + 1, updatedAt: 1234, draft: draft() })
      )
    ).toEqual({
      state: "stale",
      reason: "Draft format is no longer supported.",
      updatedAt: 1234,
    });
    expect(recoveryCandidateState(100, 101)).toBe("stale");
    expect(recoveryCandidateState(101, 100)).toBe("recoverable");
  });

  it("only persists meaningful work and can be cleared after authoritative save or discard", () => {
    const storage = memoryStorage();
    const blank = draft();
    Object.assign(blank, {
      clientName: "",
      projectName: "",
      address: "",
      phone: "",
      email: "",
      selectedCustomer: null,
      validUntil: "",
      salesPerson: "",
      tax: 0,
      discount: 0,
      documentStyle: "proposal",
      categoryNames: {},
      sectionOrder: [],
      lineItems: [],
      estimateNotes: [],
      paymentMilestones: [],
      selectedTemplateId: "",
    });
    expect(isMeaningfulEstimateNewDraft(blank)).toBe(false);
    expect(isMeaningfulEstimateNewDraft(draft())).toBe(true);

    writeEstimateNewDraftRecovery(draft(), 1234, storage);
    expect(clearEstimateNewDraftRecovery(storage)).toBe(true);
    expect(storage.getItem(ESTIMATE_NEW_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
