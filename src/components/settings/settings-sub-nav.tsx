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
  security: "Security",
  users: "Users",
  permissions: "Roles",
  categories: "Categories",
  lists: "Lists",
  subcontractors: "Subcontractors",
  "project-financial-review": "Project Financial Review",
};

function settingsChildLabel(seg: string): string {
  const lower = seg.toLowerCase();
  return (
    SETTINGS_CHILD_LABELS[lower] ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ")
  );
}

const NAV_ITEMS = [
  { href: "/settings/account", segment: "account", label: "Account" },
  { href: "/settings/company", segment: "company", label: "Company" },
  { href: "/settings/expenses", segment: "expenses", label: "Expenses" },
  { href: "/settings/security", segment: "security", label: "Security" },
  { href: "/settings/users", segment: "users", label: "Users" },
  { href: "/settings/permissions", segment: "permissions", label: "Roles" },
  { href: "/settings/categories", segment: "categories", label: "Categories" },
  { href: "/settings/lists", segment: "lists", label: "Lists" },
  { href: "/settings/subcontractors", segment: "subcontractors", label: "Subcontractors" },
  {
    href: "/settings/project-financial-review",
    segment: "project-financial-review",
    label: "Project Financial Review",
  },
] as const;

export function SettingsSubNav() {
  const parts = (usePathname() ?? "").split("/").filter(Boolean);

  const second = parts[0] === "settings" ? parts[1] : null;
  const mobileBreadcrumb =
    parts[0] === "settings" && second ? `Settings › ${settingsChildLabel(second)}` : null;

  return (
    <div className="page-container pt-4 md:pt-5">
      {mobileBreadcrumb ? (
        <p className="mb-3 text-hh-table-cell text-[var(--hh-text-secondary)] sm:hidden">
          {mobileBreadcrumb}
        </p>
      ) : null}
      <nav
        className="flex flex-wrap gap-2 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-2 shadow-operational"
        aria-label="Settings sections"
        data-testid="settings-subnav"
      >
        {NAV_ITEMS.map((item) => {
          const active = second === item.segment;
          return (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 rounded-md",
                active
                  ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-selected)]"
                  : "text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
              )}
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
