"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Users,
  Receipt,
  Settings,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon?: typeof LayoutDashboard };

const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Main",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Projects",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/estimates", label: "Estimates", icon: FileText },
    ],
  },
  {
    label: "Financial",
    items: [
      { href: "/financial", label: "Overview", icon: Receipt },
      { href: "/financial/expenses", label: "Expenses" },
      { href: "/financial/bank", label: "Bank Reconcile" },
      { href: "/financial/invoices", label: "Invoices" },
      { href: "/financial/ar", label: "AR" },
    ],
  },
  {
    label: "Labor",
    items: [
      { href: "/labor", label: "Daily Entry", icon: Users },
      { href: "/labor/workers", label: "Workers" },
      { href: "/labor/review", label: "Review" },
      { href: "/labor/invoices", label: "Invoices/Receipts" },
      { href: "/labor/payments", label: "Payments" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/settings/lists", label: "Lists" },
    ],
  },
];

export function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-[248px] shrink-0 flex-col border-r border-zinc-200/70 bg-zinc-100/70 dark:border-border dark:bg-zinc-950/60",
        className
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-zinc-200/60 px-4 dark:border-border">
        <span className="text-sm font-semibold tracking-[0.12em] text-foreground">HH UNIFIED</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-2 pb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-zinc-200/50 hover:text-foreground dark:hover:bg-zinc-800/40",
                      active && "bg-zinc-200/70 text-foreground dark:bg-zinc-800/60"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 h-4 -translate-y-1/2 rounded-r-full border-l-2 border-transparent",
                        active && "border-zinc-700 dark:border-zinc-200"
                      )}
                    />
                    {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : <span className="h-[18px] w-[18px] shrink-0" />}
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-zinc-200/60 p-2 dark:border-border">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-zinc-200/50 hover:text-foreground dark:hover:bg-zinc-800/40"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="h-[18px] w-[18px]" />
          Collapse (Soon)
        </button>
      </div>
    </aside>
  );
}
