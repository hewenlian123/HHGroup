export type EstimateMutationResult = {
  ok: boolean;
  error?: string;
};

const NO_RESULT_FAILURE: EstimateMutationResult = {
  ok: false,
  error: "Estimate change returned no result. Your edits are still unsaved.",
};

const INVALID_RESULT_FAILURE: EstimateMutationResult = {
  ok: false,
  error: "Estimate change returned an invalid result. Your edits are still unsaved.",
};

export function enforceEstimateMutationResult<T extends EstimateMutationResult>(value: T): T;
export function enforceEstimateMutationResult(value: unknown): EstimateMutationResult;
export function enforceEstimateMutationResult(value: unknown): EstimateMutationResult {
  if (value === undefined || value === null) return NO_RESULT_FAILURE;
  if (typeof value !== "object" || !("ok" in value) || typeof value.ok !== "boolean") {
    return INVALID_RESULT_FAILURE;
  }
  return value as EstimateMutationResult;
}

export function estimateMutationFailureFromError(error: unknown): EstimateMutationResult {
  const message = error instanceof Error ? error.message.trim() : "";
  return {
    ok: false,
    error: message || "Estimate change could not be completed. Your edits are still unsaved.",
  };
}
