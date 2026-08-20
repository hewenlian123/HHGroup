import type { EstimateSaveStatus } from "./estimate-builder-save-status";

export type EstimateDocumentSaveState = {
  revision: number;
  savedRevision: number;
  pendingCount: number;
  failedOperationKeys: string[];
};

export type EstimateDocumentSaveAction =
  | { type: "dirty" }
  | { type: "save-started" }
  | { type: "save-succeeded"; revision: number; operationKey: string }
  | { type: "save-failed"; operationKey: string }
  | { type: "reset" };

export function createEstimateDocumentSaveState(): EstimateDocumentSaveState {
  return {
    revision: 0,
    savedRevision: 0,
    pendingCount: 0,
    failedOperationKeys: [],
  };
}

export function estimateDocumentSaveReducer(
  state: EstimateDocumentSaveState,
  action: EstimateDocumentSaveAction
): EstimateDocumentSaveState {
  if (action.type === "reset") return createEstimateDocumentSaveState();
  if (action.type === "dirty") {
    return { ...state, revision: state.revision + 1 };
  }
  if (action.type === "save-started") {
    return { ...state, pendingCount: state.pendingCount + 1 };
  }
  if (action.type === "save-succeeded") {
    return {
      ...state,
      savedRevision: Math.max(state.savedRevision, action.revision),
      pendingCount: Math.max(0, state.pendingCount - 1),
      failedOperationKeys: state.failedOperationKeys.filter(
        (operationKey) => operationKey !== action.operationKey
      ),
    };
  }
  return {
    ...state,
    pendingCount: Math.max(0, state.pendingCount - 1),
    failedOperationKeys: state.failedOperationKeys.includes(action.operationKey)
      ? state.failedOperationKeys
      : [...state.failedOperationKeys, action.operationKey],
  };
}

export function resolveEstimateDocumentSaveStatus(
  state: EstimateDocumentSaveState
): EstimateSaveStatus {
  if (state.failedOperationKeys.length > 0) return "failed";
  if (state.pendingCount > 0) return "saving";
  if (state.revision > state.savedRevision) return "unsaved";
  if (state.savedRevision > 0) return "saved";
  return "idle";
}
