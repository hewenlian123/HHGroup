"use client";

import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";

/** Server-friendly: sets topbar breadcrumb label for the current path’s entity UUID segment. */
export function SetBreadcrumbEntityTitle({ label }: { label: string | null | undefined }) {
  useBreadcrumbEntityLabel(label);
  return null;
}
