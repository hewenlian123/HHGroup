/**
 * Shared helpers for continuous list UX (focus + scroll after add/remove).
 */

/** Id of the row visually below the removed row, else above, else null. */
export function neighborRowIdAfterRemove<T extends { id: string }>(
  rows: readonly T[],
  removedId: string
): string | null {
  const i = rows.findIndex((r) => r.id === removedId);
  if (i < 0) return null;
  return rows[i + 1]?.id ?? rows[i - 1]?.id ?? null;
}

export function scrollElementIntoViewNearest(
  el: Element | null | undefined,
  behavior: ScrollBehavior = "smooth"
): void {
  el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior });
}

/** Focus first tabbable inside a row (keyboard flow). */
export function focusFirstFocusableInContainer(
  container: Element | null | undefined,
  options: { preventScroll?: boolean } = {}
): void {
  if (!container || !(container instanceof HTMLElement)) return;
  const sel =
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const el = container.querySelector<HTMLElement>(sel);
  el?.focus({ preventScroll: options.preventScroll ?? true });
}

/** Run after React commit + layout (double rAF). */
export function afterLayout(callback: () => void): void {
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(callback);
    });
  });
}
