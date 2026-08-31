"use client";

import * as React from "react";

import type { EstimateSaveStatus } from "./estimate-builder-save-status";
import {
  createEstimateDocumentSaveState,
  estimateDocumentSaveReducer,
  resolveEstimateDocumentSaveStatus,
  type EstimateDocumentSaveAction,
  type EstimateDocumentSaveState,
} from "./estimate-document-save-state";
import {
  enforceEstimateMutationResult,
  estimateMutationFailureFromError,
  type EstimateMutationResult,
} from "./estimate-mutation-result";

type SaveResult = EstimateMutationResult;

type EstimateDocumentSaveContextValue = {
  state: EstimateDocumentSaveState;
  status: EstimateSaveStatus;
  markUnsaved: () => number;
  trackMutation: <T extends SaveResult>(
    operationKey: string,
    operation: () => Promise<T>
  ) => Promise<T>;
  waitForPendingSaves: () => Promise<boolean>;
  resetSaveState: () => void;
};

const EstimateDocumentSaveContext = React.createContext<EstimateDocumentSaveContextValue | null>(
  null
);

export function EstimateDocumentSaveProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = React.useState(createEstimateDocumentSaveState);
  const stateRef = React.useRef(state);
  const pendingRef = React.useRef(new Set<Promise<unknown>>());

  const apply = React.useCallback(
    (action: EstimateDocumentSaveAction): EstimateDocumentSaveState => {
      const next = estimateDocumentSaveReducer(stateRef.current, action);
      stateRef.current = next;
      setState(next);
      return next;
    },
    []
  );

  const markUnsaved = React.useCallback((): number => {
    return apply({ type: "dirty" }).revision;
  }, [apply]);

  const trackMutation = React.useCallback(
    async <T extends SaveResult>(operationKey: string, operation: () => Promise<T>): Promise<T> => {
      const revision = stateRef.current.revision;
      apply({ type: "save-started" });

      const pending = Promise.resolve().then(operation);
      pendingRef.current.add(pending);
      try {
        const rawResult = await pending;
        const result = enforceEstimateMutationResult(rawResult);
        if (!result.ok) {
          apply({ type: "save-failed", operationKey });
          return result;
        }
        apply({ type: "save-succeeded", revision, operationKey });
        return result;
      } catch (error) {
        apply({ type: "save-failed", operationKey });
        return estimateMutationFailureFromError(error) as T;
      } finally {
        pendingRef.current.delete(pending);
      }
    },
    [apply]
  );

  const waitForPendingSaves = React.useCallback(async (): Promise<boolean> => {
    while (pendingRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingRef.current));
    }
    const current = stateRef.current;
    return (
      current.failedOperationKeys.length === 0 &&
      current.pendingCount === 0 &&
      current.savedRevision >= current.revision
    );
  }, []);

  const resetSaveState = React.useCallback((): void => {
    apply({ type: "reset" });
  }, [apply]);

  const value = React.useMemo<EstimateDocumentSaveContextValue>(
    () => ({
      state,
      status: resolveEstimateDocumentSaveStatus(state),
      markUnsaved,
      trackMutation,
      waitForPendingSaves,
      resetSaveState,
    }),
    [markUnsaved, resetSaveState, state, trackMutation, waitForPendingSaves]
  );

  return (
    <EstimateDocumentSaveContext.Provider value={value}>
      {children}
    </EstimateDocumentSaveContext.Provider>
  );
}

export function useEstimateDocumentSave(): EstimateDocumentSaveContextValue {
  const value = React.useContext(EstimateDocumentSaveContext);
  if (!value) {
    throw new Error("useEstimateDocumentSave must be used inside EstimateDocumentSaveProvider");
  }
  return value;
}
