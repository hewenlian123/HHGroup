"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

const ACTIVE_CLASS = "estimate-builder-active";

/** Builder routes: /estimates/new and /estimates/[id] (not list, preview, print). */
function isEstimateBuilderPath(pathname: string): boolean {
  if (pathname === "/estimates/new") return true;
  const match = /^\/estimates\/([^/]+)$/.exec(pathname);
  if (!match) return false;
  const segment = match[1];
  if (segment === "new") return true;
  const excluded = new Set(["preview", "print"]);
  return !excluded.has(segment);
}

/**
 * Immersive chrome: darkens app main + topbar while on estimate builder pages.
 * UI-only; removed on leave.
 */
export function EstimateBuilderPageChrome({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname() ?? "";
  const active = isEstimateBuilderPath(pathname);

  React.useEffect(() => {
    const main = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    const topbar = document.querySelector<HTMLElement>("[data-app-topbar]");
    if (!active) {
      document.body.classList.remove(ACTIVE_CLASS);
      main?.classList.remove(ACTIVE_CLASS);
      topbar?.classList.remove(ACTIVE_CLASS);
      topbar?.classList.remove("estimate-topbar-glass");
      return;
    }
    document.body.classList.add(ACTIVE_CLASS);
    main?.classList.add(ACTIVE_CLASS);
    topbar?.classList.add(ACTIVE_CLASS);
    topbar?.classList.add("estimate-topbar-glass");
    return () => {
      document.body.classList.remove(ACTIVE_CLASS);
      main?.classList.remove(ACTIVE_CLASS);
      topbar?.classList.remove(ACTIVE_CLASS);
      topbar?.classList.remove("estimate-topbar-glass");
    };
  }, [active]);

  return <>{children}</>;
}
