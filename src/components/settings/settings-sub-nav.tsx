"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Second path segment under `/settings/*` → breadcrumb label (matches topbar naming where useful). */
const SETTINGS_CHILD_LABELS: Record<string, string> = {
  company: "Company",
  expenses: "Expenses",
  account: "Account",
  users: "Users",
  permissions: "Permissions",
  categories: "Categories",
  lists: "Lists",
  subcontractors: "Subcontractors",
};

function settingsChildLabel(seg: string): string {
  const lower = seg.toLowerCase();
  return (
    SETTINGS_CHILD_LABELS[lower] ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ")
  );
}

const NAV_ITEMS = [
  { href: "/settings/company", segment: "company", label: "Company" },
  { href: "/settings/expenses", segment: "expenses", label: "Expenses" },
] as const;

export function SettingsSubNav() {
  const parts = (usePathname() ?? "").split("/").filter(Boolean);

  const second = parts[0] === "settings" ? parts[1] : null;
  const mobileBreadcrumb =
    parts[0] === "settings" && second ? `Settings › ${settingsChildLabel(second)}` : null;

  return (
    <div className={cn("page-container border-b border-border/60 pb-3 pt-4 md:pb-3 md:pt-5")}>
      {mobileBreadcrumb ? (
        <p className="mb-3 text-[13px] text-muted-foreground sm:hidden">{mobileBreadcrumb}</p>
      ) : null}
      <nav
        className="flex flex-wrap gap-2"
        aria-label="Settings sections"
        data-testid="settings-subnav"
      >
        {NAV_ITEMS.map((item) => {
          const active = second === item.segment;
          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-sm"
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}
