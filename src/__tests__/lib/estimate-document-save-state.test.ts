import { describe, expect, it } from "vitest";

import {
  createEstimateDocumentSaveState,
  estimateDocumentSaveReducer,
  resolveEstimateDocumentSaveStatus,
} from "@/app/estimates/_components/estimate-document-save-state";

describe("Estimate whole-document save state", () => {
  it("moves through unsaved, saving, and saved only after the current revision persists", () => {
    const initial = createEstimateDocumentSaveState();
    const dirty = estimateDocumentSaveReducer(initial, { type: "dirty" });
    expect(resolveEstimateDocumentSaveStatus(dirty)).toBe("unsaved");

    const saving = estimateDocumentSaveReducer(dirty, { type: "save-started" });
    expect(resolveEstimateDocumentSaveStatus(saving)).toBe("saving");

    const saved = estimateDocumentSaveReducer(saving, {
      type: "save-succeeded",
      revision: dirty.revision,
      operationKey: "line:1",
    });
    expect(resolveEstimateDocumentSaveStatus(saved)).toBe("saved");
  });

  it("does not call the document saved when a newer edit arrives during persistence", () => {
    const dirty = estimateDocumentSaveReducer(createEstimateDocumentSaveState(), {
      type: "dirty",
    });
    const saving = estimateDocumentSaveReducer(dirty, { type: "save-started" });
    const newerEdit = estimateDocumentSaveReducer(saving, { type: "dirty" });
    const firstSaveCompleted = estimateDocumentSaveReducer(newerEdit, {
      type: "save-succeeded",
      revision: dirty.revision,
      operationKey: "line:1",
    });

    expect(resolveEstimateDocumentSaveStatus(firstSaveCompleted)).toBe("unsaved");
  });

  it("keeps saving visible until every in-flight mutation settles", () => {
    let state = estimateDocumentSaveReducer(createEstimateDocumentSaveState(), { type: "dirty" });
    const revision = state.revision;
    state = estimateDocumentSaveReducer(state, { type: "save-started" });
    state = estimateDocumentSaveReducer(state, { type: "save-started" });
    state = estimateDocumentSaveReducer(state, {
      type: "save-succeeded",
      revision,
      operationKey: "line:1",
    });

    expect(resolveEstimateDocumentSaveStatus(state)).toBe("saving");

    state = estimateDocumentSaveReducer(state, {
      type: "save-succeeded",
      revision,
      operationKey: "notes",
    });
    expect(resolveEstimateDocumentSaveStatus(state)).toBe("saved");
  });

  it("surfaces a recoverable save failure without advancing the saved revision", () => {
    let state = estimateDocumentSaveReducer(createEstimateDocumentSaveState(), { type: "dirty" });
    state = estimateDocumentSaveReducer(state, { type: "save-started" });
    state = estimateDocumentSaveReducer(state, {
      type: "save-failed",
      operationKey: "line:1",
    });

    expect(resolveEstimateDocumentSaveStatus(state)).toBe("failed");
    expect(state.savedRevision).toBe(0);
    expect(state.revision).toBe(1);
  });

  it("keeps one failed document operation visible until that same operation succeeds", () => {
    let state = estimateDocumentSaveReducer(createEstimateDocumentSaveState(), { type: "dirty" });
    const revision = state.revision;
    state = estimateDocumentSaveReducer(state, { type: "save-started" });
    state = estimateDocumentSaveReducer(state, {
      type: "save-failed",
      operationKey: "line:1",
    });
    state = estimateDocumentSaveReducer(state, { type: "save-started" });
    state = estimateDocumentSaveReducer(state, {
      type: "save-succeeded",
      revision,
      operationKey: "estimate-meta",
    });

    expect(resolveEstimateDocumentSaveStatus(state)).toBe("failed");

    state = estimateDocumentSaveReducer(state, { type: "save-started" });
    state = estimateDocumentSaveReducer(state, {
      type: "save-succeeded",
      revision,
      operationKey: "line:1",
    });
    expect(resolveEstimateDocumentSaveStatus(state)).toBe("saved");
  });
});
