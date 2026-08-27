import { describe, expect, it } from "vitest";

import { shouldHideFloatingQuickActionFab } from "@/lib/floating-fab-visibility";
import {
  HH_PROJECT_OS_COMMAND_ITEMS,
  HH_PROJECT_OS_NAV_SECTIONS,
  getHhProjectOsMobileActiveHref,
  isHhProjectOsNavItem,
} from "@/lib/navigation/ia";
import { QUICK_ACTION_ROUTES } from "@/lib/route-prefetch";

const DELETED_MODULE_ROOTS = [
  "/tasks",
  "/punch-list",
  "/schedule",
  "/materials",
  "/documents",
  "/projects/documents",
  "/site-photos",
  "/inspection-log",
] as const;

const DELETED_STANDALONE_MODULE_ROOTS = DELETED_MODULE_ROOTS.filter(
  (root) => root !== "/projects/documents"
);

function belongsToDeletedModule(href: string): boolean {
  const path = href.split("?")[0].split("#")[0];
  return DELETED_MODULE_ROOTS.some((root) => path === root || path.startsWith(root + "/"));
}

describe("deleted project modules navigation contract", () => {
  it("keeps exactly the four retained modules in the Projects section", () => {
    const projects = HH_PROJECT_OS_NAV_SECTIONS.find((section) => section.key === "PROJECTS");
    const items = projects?.entries.filter(isHhProjectOsNavItem) ?? [];
    expect(items.map(({ label }) => label)).toEqual(["Projects", "Estimates", "Change Orders", "Time Entries"]);
    expect(items.map(({ href }) => href)).toEqual(["/projects", "/estimates", "/change-orders", "/labor"]);
  });

  it("does not retain navigation, command, quick-action, or mobile-owner aliases", () => {
    const navHrefs = HH_PROJECT_OS_NAV_SECTIONS.flatMap((section) =>
      section.entries.flatMap((entry) => {
        if (!isHhProjectOsNavItem(entry)) return [];
        return [entry.href, ...("aliases" in entry ? (entry.aliases ?? []) : [])];
      })
    );
    expect(navHrefs.some(belongsToDeletedModule)).toBe(false);
    expect(HH_PROJECT_OS_COMMAND_ITEMS.some((item) => belongsToDeletedModule(item.href))).toBe(false);
    expect(QUICK_ACTION_ROUTES.some(belongsToDeletedModule)).toBe(false);
    for (const root of DELETED_STANDALONE_MODULE_ROOTS) {
      expect(getHhProjectOsMobileActiveHref(root)).toBeNull();
      expect(shouldHideFloatingQuickActionFab(root)).toBe(false);
    }
  });

  it("removes the retired Documents section completely", () => {
    expect(HH_PROJECT_OS_NAV_SECTIONS.map((section) => String(section.key))).not.toContain(
      "DOCUMENTS"
    );
  });
});
