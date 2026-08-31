import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("one canonical system-state family owns empty, no-results, loading, retry, and permission states", () => {
  const states = source("src/components/ui/system-state.tsx");
  const emptyCompatibility = source("src/components/empty-state.tsx");
  const loadingCompatibility = source("src/components/loading-state.tsx");

  for (const name of [
    "SystemState",
    "EmptyState",
    "NoResults",
    "LoadingState",
    "ErrorRetry",
    "PermissionDenied",
  ]) {
    assert.match(states, new RegExp(`export function ${name}`));
  }
  assert.match(states, /aria-busy/);
  assert.match(states, /role="alert"/);
  assert.match(states, /onRetry/);
  assert.match(emptyCompatibility, /ui\/system-state/);
  assert.match(loadingCompatibility, /ui\/system-state/);
});

test("InlineFeedback and FieldMessage own semantic soft-state presentation with non-color context", () => {
  const feedback = source("src/components/ui/feedback.tsx");
  const field = source("src/components/ui/field.tsx");
  const banner = source("src/components/alert-banner.tsx");

  for (const role of ["success", "warning", "information", "danger"]) {
    assert.match(feedback, new RegExp(`hh-${role}-soft-fill`));
    assert.match(feedback, new RegExp(`hh-${role}-border`));
    assert.match(feedback, new RegExp(`hh-${role}\\)`));
  }
  assert.match(feedback, /CheckCircle2/);
  assert.match(feedback, /AlertTriangle/);
  assert.match(feedback, /Info/);
  assert.match(feedback, /XCircle/);
  assert.match(feedback, /export function FieldMessage/);
  assert.match(field, /<FieldMessage/);
  assert.match(banner, /<InlineFeedback/);
});

test("toast convergence leaves one app-facing API and one rendered live region", () => {
  const provider = source("src/components/toast/toast-provider.tsx");
  const api = source("src/lib/toast.ts");
  const providers = source("src/app/providers.tsx");
  const shell = source("src/components/layout/app-shell.tsx");
  const expense = source("src/app/financial/expenses/expenses-client.tsx");
  const receiptQueue = source("src/app/financial/receipt-queue/receipt-queue-workspace.tsx");

  assert.match(api, /export const toast/);
  assert.match(api, /subscribeToToasts/);
  assert.match(provider, /subscribeToToasts/);
  assert.equal((provider.match(/aria-live=/g) ?? []).length, 1);
  assert.match(provider, /motion-reduce:animate-none/);
  assert.doesNotMatch(providers, /<ToastProvider>|toast\/toast-provider/);
  assert.doesNotMatch(providers, /HotToaster|components\/ui\/sonner/);
  assert.match(shell, /toast\/toast-provider/);
  assert.equal((shell.match(/<ToastProvider>/g) ?? []).length, 1);
  assert.equal((shell.match(/<AppShellProviders>/g) ?? []).length, 2);
  assert.match(shell, /<HhRouteThemeRoot[\s\S]*?<AppShellProviders>/);
  assert.equal(existsSync(resolve(ROOT, "src/lib/sonner-toast.ts")), false);
  assert.doesNotMatch(expense, /react-hot-toast/);
  assert.doesNotMatch(receiptQueue, /react-hot-toast/);
});

test("loading and skeleton foundations expose busy state without forced animation", () => {
  const states = source("src/components/ui/system-state.tsx");
  const skeleton = source("src/components/ui/skeleton.tsx");

  assert.match(states, /aria-busy="true"/);
  assert.match(skeleton, /motion-reduce:animate-none/);
  assert.match(skeleton, /aria-hidden/);
});
