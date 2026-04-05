import * as React from "react";

/**
 * Avoid skeleton flicker on fast loads: only show loading UI after `delayMs`.
 */
export function useDelayedPending(isPending: boolean, delayMs = 130): boolean {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    if (!isPending) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [isPending, delayMs]);
  return show;
}
