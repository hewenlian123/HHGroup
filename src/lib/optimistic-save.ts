import { flushSync } from "react-dom";

export type PersistResult = { error?: string } | void;

export type OptimisticPersistOptions<TSnapshot> = {
  setBusy: (busy: boolean) => void;
  getSnapshot: () => TSnapshot;
  /** Runs inside flushSync after setBusy(true). */
  apply: () => void;
  rollback: (snapshot: TSnapshot) => void;
  persist: () => Promise<PersistResult>;
  onError?: (message: string) => void;
  onSuccess?: () => void;
};

/**
 * Immediate busy + optimistic UI (flushSync), then persist in the background.
 * Rolls back on `{ error }` or thrown exception. Does not use router.refresh.
 */
export function runOptimisticPersist<TSnapshot>(opts: OptimisticPersistOptions<TSnapshot>): void {
  const { setBusy, getSnapshot, apply, rollback, persist, onError, onSuccess } = opts;
  const snap = getSnapshot();
  flushSync(() => {
    setBusy(true);
    apply();
  });
  void (async () => {
    try {
      const r = await persist();
      const err =
        r && typeof r === "object" && "error" in r && (r as { error?: string }).error
          ? String((r as { error?: string }).error)
          : undefined;
      if (err) {
        flushSync(() => rollback(snap));
        onError?.(err);
        return;
      }
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      flushSync(() => rollback(snap));
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  })();
}
