import type { TestInfo } from "@playwright/test";

/**
 * Shared E2E environment rules so VS Code / Playwright UI behave like local CLI
 * without requiring `playwright.env` in settings.
 *
 * - **Local target** (`E2E_BASE_URL` unset or localhost / 127.0.0.1): safe to run
 *   worker-payment and delete-mutation tests against your dev server.
 * - **Non-local** (e.g. production URL): mutations stay off unless explicitly enabled.
 * - **Playwright projects** `chromium-payments` / `chromium-delete-mutations`: when you run
 *   under that project (UI dropdown / `--project`), mutations are allowed even if `E2E_BASE_URL`
 *   is not localhost (unless you set `E2E_ALLOW_*_MUTATIONS=0`).
 *
 * Override:
 * - `E2E_ALLOW_PAYMENT_MUTATIONS=1|0`
 * - `E2E_ALLOW_DELETE_MUTATIONS=1|0`
 */

/** Must match `playwright.config.ts` project `name`. */
export const E2E_PAYMENT_PROJECT = "chromium-payments";
export const E2E_DELETE_MUTATIONS_PROJECT = "chromium-delete-mutations";

export function e2eTargetOrigin(): string {
  return (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isLocalE2eTarget(): boolean {
  const base = e2eTargetOrigin().toLowerCase();
  return (
    base.includes("localhost") ||
    base.includes("127.0.0.1") ||
    base.includes("[::1]")
  );
}

/** Real worker payment writes; allow on local dev, explicit env, or project `chromium-payments`. */
export function allowWorkerPaymentMutations(testInfo?: TestInfo): boolean {
  if (process.env.E2E_ALLOW_PAYMENT_MUTATIONS === "0") return false;
  if (testInfo?.project.name === E2E_PAYMENT_PROJECT) return true;
  if (process.env.E2E_ALLOW_PAYMENT_MUTATIONS === "1") return true;
  return isLocalE2eTarget();
}

/** Create→delete flows; allow on local dev, explicit env, or project `chromium-delete-mutations`. */
export function allowDeleteMutations(testInfo?: TestInfo): boolean {
  if (process.env.E2E_ALLOW_DELETE_MUTATIONS === "0") return false;
  if (testInfo?.project.name === E2E_DELETE_MUTATIONS_PROJECT) return true;
  if (process.env.E2E_ALLOW_DELETE_MUTATIONS === "1") return true;
  return isLocalE2eTarget();
}
