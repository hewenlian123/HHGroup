"use client";

import * as React from "react";

/** Viewport in tablet / iPad range (640px–1023px). Desktop at 1024px+ is false. */
export function useIsTabletNav(): boolean {
  const [v, setV] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px) and (max-width: 1023px)");
    const fn = () => setV(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return v;
}
