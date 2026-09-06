"use client";
import { contactSections, contactActiveSection } from "@/lib/navigation/contacts-workspace";
import { Suspense } from "react";
import { LaborWorkspaceNav } from "@/components/labor/labor-workspace-nav";
import { isLaborWorkspace } from "@/lib/navigation/labor-workspace";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getHhProjectOsWorkspace, getHhProjectOsWorkspaceActiveHref } from "@/lib/navigation/ia";

export function WorkspaceNavigation({ pathname }: { pathname: string }) {
  if (isLaborWorkspace(pathname))
    return (
      <Suspense fallback={null}>
        <LaborWorkspaceNav pathname={pathname} />
      </Suspense>
    );
  const workspace = getHhProjectOsWorkspace(pathname);
  if (
    !workspace?.entries.length ||
    /\/(print|preview)(\/|$)/.test(pathname) ||
    /^\/labor\/payments\/[^/]+\/receipt(?:\/|$)/.test(pathname) ||
    /^\/(projects|estimates)\/[^/]+/.test(pathname)
  ) {
    return null;
  }

  const navigationEntries: ReadonlyArray<{ href: string; label: string; group?: string }> =
    workspace.key === "CONTACTS" ? contactSections : workspace.entries;
  const activeHref =
    workspace.key === "CONTACTS"
      ? contactSections.find((item) => item.label === contactActiveSection(pathname))?.href
      : getHhProjectOsWorkspaceActiveHref(pathname, workspace);
  const compact = ["PROJECTS", "FINANCIAL", "CONTACTS"].includes(workspace.key);
  const visibleGroupCount = workspace.key === "CONTACTS" ? 2 : 3;
  const groups = [...new Set(navigationEntries.map((item) => item.group ?? item.href))];
  const selectedClass =
    "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)] forced-colors:underline";
  const overflowEntries = compact
    ? navigationEntries.filter(
        (item) => groups.indexOf(item.group ?? item.href) >= visibleGroupCount
      )
    : [];
  const overflowActive = overflowEntries.find((item) => item.href === activeHref);

  return (
    <nav
      aria-label={`${workspace.label} workspace`}
      data-workspace-navigation
      className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto border-b border-[var(--hh-border-subtle)] bg-[var(--hh-surface-canvas)] px-3 py-2 print:hidden"
    >
      {groups.map((group, index) => {
        const entries = navigationEntries.filter((item) => (item.group ?? item.href) === group);
        const active = entries.some((item) => item.href === activeHref);
        if (!entries[0].group) {
          const item = entries[0];
          return (
            <Button
              key={group}
              asChild
              variant="ghost"
              className={`min-h-11 shrink-0 ${compact && index >= visibleGroupCount ? "hidden lg:inline-flex" : ""} ${active ? selectedClass : ""}`}
            >
              <Link href={item.href} prefetch={false} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </Button>
          );
        }
        return (
          <DropdownMenu key={group}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`min-h-11 shrink-0 gap-1 ${compact && index >= visibleGroupCount ? "hidden lg:inline-flex" : ""} ${active ? selectedClass : ""}`}
              >
                {group}
                <ChevronDown className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {entries.map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  asChild
                  className={`min-h-11 ${item.href === activeHref ? selectedClass : ""}`}
                >
                  <Link
                    href={item.href}
                    prefetch={false}
                    aria-current={item.href === activeHref ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
      {overflowEntries.length > 0 && (
        <div className="lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`min-h-11 gap-1 ${overflowActive ? selectedClass : ""}`}
                aria-label={`More ${workspace.label} sections`}
                title={overflowActive?.label}
              >
                More <ChevronDown className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflowEntries.map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  asChild
                  className={`min-h-11 ${item.href === activeHref ? selectedClass : ""}`}
                >
                  <Link
                    href={item.href}
                    prefetch={false}
                    aria-current={item.href === activeHref ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </nav>
  );
}
