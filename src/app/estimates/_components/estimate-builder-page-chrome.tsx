"use client";

import * as React from "react";

/**
 * Keeps Estimate routes inside the shared application chrome.
 * The former route-level dark treatment was superseded by Operational Compact.
 */
export function EstimateBuilderPageChrome({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
