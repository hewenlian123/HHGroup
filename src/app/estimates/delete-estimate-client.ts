"use client";

export type DeleteEstimateActionResult = {
  ok: boolean;
  error?: string;
  diagnostic?: unknown;
};

export type DeleteEstimateAction = (formData: FormData) => Promise<DeleteEstimateActionResult>;

const DELETE_ESTIMATE_UI_TIMEOUT_MS = 25_000;

export async function runDeleteEstimateActionWithTimeout(
  action: DeleteEstimateAction,
  formData: FormData
): Promise<DeleteEstimateActionResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<DeleteEstimateActionResult>((resolve) => {
    timeout = setTimeout(() => {
      resolve({
        ok: false,
        error:
          "Delete request timed out. Please refresh and try again; the estimate was not confirmed deleted.",
      });
    }, DELETE_ESTIMATE_UI_TIMEOUT_MS);
  });

  try {
    return await Promise.race([action(formData), timeoutResult]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
