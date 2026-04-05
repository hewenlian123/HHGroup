"use client";

import * as React from "react";

export type RqLayout = "mobile" | "tablet" | "desktop";

function readLayout(): RqLayout {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

/** Client-only breakpoint: mobile &lt;768px, tablet 768–1023px, desktop 1024px+. */
export function useRqLayout(): RqLayout {
  const [layout, setLayout] = React.useState<RqLayout>(() =>
    typeof window !== "undefined" ? readLayout() : "desktop"
  );

  React.useLayoutEffect(() => {
    setLayout(readLayout());
    const onChange = () => setLayout(readLayout());
    const mq = window.matchMedia("(min-width: 768px)");
    const mqLg = window.matchMedia("(min-width: 1024px)");
    mq.addEventListener("change", onChange);
    mqLg.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      mqLg.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);

  return layout;
}
