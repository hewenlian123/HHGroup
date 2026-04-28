"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Receipt,
  Banknote,
  ShoppingCart,
  Clock,
  Wallet,
  Users,
  FileStack,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDollarSign,
  CheckSquare,
  ListChecks,
  Calendar,
  Camera,
  ClipboardCheck,
  Percent,
  Package,
  ReceiptText,
  Upload,
  Calculator,
  FilePen,
  AlertTriangle,
  Activity,
  FlaskConical,
  BarChart2,
  ScrollText,
  MonitorCheck,
  Archive,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createBrowserClient } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchFinancialRoute } from "@/lib/financial-nav-prefetch";
import { RECEIPT_QUEUE_CHANGED_EVENT, fetchReceiptQueueBadgeCount } from "@/lib/receipt-queue";
import { getCompanyInitials, getCompanyProfile } from "@/lib/company-profile";
import { useSystemHealth } from "@/contexts/system-health-context";

const STORAGE_KEY = "hh.sidebarSections";

type NavItem = { href: string; label: string; icon?: LucideIcon };

const SECTION_KEYS = ["PROJECTS", "OPERATIONS", "FINANCE", "LABOR", "PEOPLE", "SYSTEM"] as const;
const DEFAULT_OPEN_SECTIONS: Record<(typeof SECTION_KEYS)[number], boolean> = {
  PROJECTS: true,
  OPERATIONS: true,
  FINANCE: true,
  LABOR: true,
  PEOPLE: true,
  SYSTEM: true,
};

const sections: { key: (typeof SECTION_KEYS)[number]; label: string; items: NavItem[] }[] = [
  {
    key: "PROJECTS",
    label: "PROJECTS",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/estimates", label: "Estimates", icon: FileText },
      { href: "/change-orders", label: "Change Orders", icon: FilePen },
      { href: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    key: "OPERATIONS",
    label: "OPERATIONS",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/punch-list", label: "Punch List", icon: ListChecks },
      { href: "/schedule", label: "Schedule", icon: Calendar },
      { href: "/site-photos", label: "Site Photos", icon: Camera },
      { href: "/inspection-log", label: "Inspection Log", icon: ClipboardCheck },
      { href: "/materials/catalog", label: "Material Catalog", icon: Package },
    ],
  },
  {
    key: "FINANCE",
    label: "FINANCE",
    items: [
      { href: "/financial/invoices", label: "Invoices", icon: FileText },
      { href: "/financial/payments", label: "Payments Received", icon: CircleDollarSign },
      { href: "/financial/commissions", label: "Commission Payments", icon: Percent },
      { href: "/financial/deposits", label: "Deposits", icon: Banknote },
      { href: "/bills", label: "Bills", icon: Receipt },
      { href: "/financial/expenses", label: "Expenses", icon: ShoppingCart },
      { href: "/financial/receipt-queue", label: "Receipt Queue", icon: Inbox },
      { href: "/financial/accounts", label: "Accounts", icon: Wallet },
    ],
  },
  {
    key: "LABOR",
    label: "LABOR",
    items: [
      { href: "/labor", label: "Time Entries", icon: Clock },
      { href: "/labor/reimbursements", label: "Reimbursements", icon: ReceiptText },
      { href: "/labor/worker-balances", label: "Worker Balances", icon: Wallet },
      { href: "/labor/payments", label: "Worker Payments", icon: CircleDollarSign },
      { href: "/labor/advances", label: "Worker Advances", icon: CircleDollarSign },
      { href: "/labor/receipts", label: "Receipt Uploads", icon: Upload },
      { href: "/labor/worker-invoices", label: "Worker Invoices", icon: FileText },
      { href: "/labor/payroll", label: "Payroll Summary", icon: Calculator },
    ],
  },
  {
    key: "PEOPLE",
    label: "PEOPLE",
    items: [
      { href: "/workers", label: "Worker Profile", icon: Users },
      { href: "/workers/summary", label: "Worker Summary", icon: BarChart2 },
      { href: "/labor/subcontractors", label: "Vendors", icon: Users },
      { href: "/subcontractors", label: "Subcontractors", icon: Users },
    ],
  },
  {
    key: "SYSTEM",
    label: "SYSTEM",
    items: [
      { href: "/system-health", label: "System Health", icon: Activity },
      { href: "/system-tests", label: "System Tests", icon: FlaskConical },
      { href: "/system-tests/ui", label: "UI Tests", icon: MonitorCheck },
      { href: "/system-metrics", label: "System Metrics", icon: BarChart2 },
      { href: "/system-logs", label: "System Logs", icon: ScrollText },
      { href: "/system/backups", label: "Backups", icon: Archive },
    ],
  },
];

const standaloneItems: NavItem[] = [
  { href: "/documents", label: "Documents", icon: FileStack },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Bumps when `count` changes so the badge remounts and the one-shot animation runs (skip initial mount). */
function useReceiptQueueCountAnimKey(count: number) {
  const prev = React.useRef<number | null>(null);
  const [animKey, setAnimKey] = React.useState(0);
  React.useEffect(() => {
    if (prev.current !== null && prev.current !== count) {
      setAnimKey((k) => k + 1);
    }
    prev.current = count;
  }, [count]);
  return animKey;
}

function financialNavPrefetchProps(
  href: string,
  run: (h: string) => void
): { onPointerEnter?: () => void; onPointerDown?: () => void } {
  if (href !== "/financial/expenses" && href !== "/financial/receipt-queue") return {};
  const prefetch = () => run(href);
  return { onPointerEnter: prefetch, onPointerDown: prefetch };
}

export function Sidebar({
  className,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  className?: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const prefetchSupabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);
  const prefetchFinancialNav = React.useCallback(
    (href: string) => prefetchFinancialRoute(queryClient, prefetchSupabase, href),
    [queryClient, prefetchSupabase]
  );
  const [orgName, setOrgName] = React.useState("HH Group");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => ({}));
  const [receiptQueueCount, setReceiptQueueCount] = React.useState(0);
  const receiptQueueAnimKey = useReceiptQueueCountAnimKey(receiptQueueCount);
  const sectionsInitDone = React.useRef(false);
  const activeSectionKey = React.useMemo(() => {
    for (const section of sections) {
      if (
        section.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
      ) {
        return section.key;
      }
    }
    return null;
  }, [pathname]);

  React.useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;

    const client = createBrowserClient(url, anon);
    let mounted = true;
    const load = async () => {
      try {
        const profile = await getCompanyProfile(client);
        if (!mounted || !profile) return;
        setOrgName(profile.org_name || "HH Group");
        setLogoUrl(profile.logo_url);
      } catch {
        // Keep default fallback branding.
      }
    };
    void load();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon || typeof window === "undefined") return;
    const client = createBrowserClient(url, anon);
    let cancelled = false;
    const load = async () => {
      try {
        const n = await fetchReceiptQueueBadgeCount(client);
        if (!cancelled) setReceiptQueueCount(n);
      } catch {
        if (!cancelled) setReceiptQueueCount(0);
      }
    };
    void load();
    const onQueue = () => void load();
    window.addEventListener(RECEIPT_QUEUE_CHANGED_EVENT, onQueue);
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener(RECEIPT_QUEUE_CHANGED_EVENT, onQueue);
      window.clearInterval(id);
    };
  }, []);

  React.useEffect(() => {
    if (sectionsInitDone.current) return;
    sectionsInitDone.current = true;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobileOrTablet) {
      const allClosed = SECTION_KEYS.reduce(
        (acc, k) => ({ ...acc, [k]: false }),
        {} as Record<string, boolean>
      );
      setOpenSections(allClosed);
      return;
    }
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === "object") {
          setOpenSections({ ...DEFAULT_OPEN_SECTIONS, ...parsed });
          return;
        }
      }
    } catch {
      // ignore
    }
    setOpenSections(DEFAULT_OPEN_SECTIONS);
  }, []);

  React.useEffect(() => {
    if (!activeSectionKey || collapsed) return;
    setOpenSections((prev) => {
      if (prev[activeSectionKey]) return prev;
      const next = { ...prev, [activeSectionKey]: true };
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
      return next;
    });
  }, [activeSectionKey, collapsed]);

  const setSectionOpen = React.useCallback((key: string, open: boolean) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: open };
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const { systemHealth } = useSystemHealth();
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  /** Nav row: active = soft surface + accent icon (Linear-style) */
  const navRowClass = (active: boolean) =>
    cn(
      "group relative flex items-center rounded-md text-[13px] transition-colors duration-\\[120ms\\] ease-out touch-manipulation",
      collapsed
        ? "min-h-[44px] justify-center px-2 py-1.5 lg:min-h-0"
        : "max-lg:min-h-[44px] min-h-0 gap-2.5 px-2 py-1.5 lg:min-h-0",
      active
        ? "bg-gray-100 font-medium text-text-primary dark:bg-muted/60 dark:text-foreground"
        : "font-normal text-text-primary hover:bg-gray-50 active:bg-gray-100 dark:text-foreground/90 dark:hover:bg-muted/40 dark:active:bg-muted/50"
    );

  const navIconClass = (active: boolean, extra?: string) =>
    cn(
      "h-[16px] w-[16px] shrink-0 transition-colors duration-\\[120ms\\] ease-out",
      active
        ? "text-brand-primary dark:text-blue-400"
        : "text-text-secondary group-hover:text-text-primary dark:group-hover:text-foreground",
      extra
    );

  return (
    <aside
      data-app-sidebar
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-gray-100 bg-white dark:border-border dark:bg-background",
        collapsed ? "w-[72px]" : "w-[210px]",
        className
      )}
    >
      <div
        className={cn(
          "flex h-12 items-center gap-2 border-b border-gray-100 dark:border-border",
          collapsed ? "px-3" : "px-3"
        )}
      >
        <Avatar className="h-7 w-7 rounded-md">
          {logoUrl ? <AvatarImage src={logoUrl} alt={orgName} className="object-contain" /> : null}
          <AvatarFallback className="rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
            {getCompanyInitials(orgName)}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-text-secondary">
              HH Unified
            </p>
            <p className="truncate text-sm font-medium text-text-primary dark:text-foreground">
              {orgName}
            </p>
          </div>
        )}
      </div>

      <nav className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 py-3" : "px-2 py-3")}>
        {/* Dashboard */}
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard"
            onClick={onNavigate}
            title={collapsed ? "Dashboard" : undefined}
            aria-label={collapsed ? "Dashboard" : undefined}
            className={navRowClass(isActive("/dashboard"))}
          >
            <LayoutDashboard className={navIconClass(isActive("/dashboard"))} strokeWidth={1.75} />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </Link>
        </div>

        {/* Sections — collapsible groups, Estimates-style labels */}
        <div className={cn("flex flex-col", collapsed && "gap-1")}>
          {sections.map((section, sectionIndex) => {
            const isOpen = openSections[section.key] ?? false;
            if (collapsed) {
              return (
                <div
                  key={section.key}
                  className={cn("flex flex-col gap-1", sectionIndex > 0 && "mt-6")}
                >
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    const navLabel =
                      item.href === "/financial/receipt-queue"
                        ? `Receipt Queue (${receiptQueueCount})`
                        : item.label;
                    if (item.href === "/financial/receipt-queue" && Icon) {
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onNavigate}
                          {...financialNavPrefetchProps(item.href, prefetchFinancialNav)}
                          title={navLabel}
                          aria-label={navLabel}
                          className={navRowClass(active)}
                        >
                          <div className="relative flex shrink-0 items-center justify-center">
                            <Icon className={navIconClass(active)} strokeWidth={1.75} />
                            {receiptQueueCount > 0 ? (
                              <span
                                key={receiptQueueAnimKey}
                                className={cn(
                                  "absolute -right-2 -top-1 z-[1] flex min-h-[15px] min-w-[15px] items-center justify-center rounded-sm px-1 text-[10px] font-semibold tabular-nums leading-none animate-receipt-queue-badge",
                                  active
                                    ? "text-brand-primary dark:text-blue-400"
                                    : "text-text-primary dark:text-foreground"
                                )}
                                aria-hidden
                              >
                                {receiptQueueCount > 99 ? "99+" : receiptQueueCount}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      );
                    }
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        {...financialNavPrefetchProps(item.href, prefetchFinancialNav)}
                        title={navLabel}
                        aria-label={navLabel}
                        className={navRowClass(active)}
                      >
                        {Icon ? <Icon className={navIconClass(active)} strokeWidth={1.75} /> : null}
                      </Link>
                    );
                  })}
                </div>
              );
            }
            return (
              <div key={section.key} className={cn("flex flex-col", sectionIndex > 0 && "mt-6")}>
                <button
                  type="button"
                  onClick={() => setSectionOpen(section.key, !isOpen)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-text-secondary transition-colors duration-150 ease-out hover:bg-gray-50 active:bg-gray-100 dark:text-muted-foreground dark:hover:bg-muted/40 dark:active:bg-muted/50 lg:min-h-0"
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown
                      className="h-3.5 w-3.5 shrink-0 opacity-70"
                      aria-hidden
                      strokeWidth={1.75}
                    />
                  ) : (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 opacity-70"
                      aria-hidden
                      strokeWidth={1.75}
                    />
                  )}
                  <span className="truncate">{section.label}</span>
                </button>
                {isOpen ? (
                  <div>
                    <div className="flex flex-col gap-1">
                      {section.items.map((item) => {
                        const active = isActive(item.href);
                        const Icon = item.icon;
                        const navLabel =
                          item.href === "/financial/receipt-queue"
                            ? `Receipt Queue (${receiptQueueCount})`
                            : item.label;
                        if (item.href === "/financial/receipt-queue" && Icon) {
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={onNavigate}
                              {...financialNavPrefetchProps(item.href, prefetchFinancialNav)}
                              title={collapsed ? navLabel : undefined}
                              aria-label={collapsed ? navLabel : undefined}
                              className={navRowClass(active)}
                            >
                              <Icon className={navIconClass(active)} strokeWidth={1.75} />
                              <span className="flex min-w-0 flex-1 items-baseline gap-0">
                                <span className="truncate">Receipt Queue </span>
                                <span
                                  key={receiptQueueAnimKey}
                                  className="inline-block shrink-0 origin-center rounded-sm px-0.5 tabular-nums animate-receipt-queue-badge"
                                >
                                  ({receiptQueueCount})
                                </span>
                              </span>
                            </Link>
                          );
                        }
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onNavigate}
                            {...financialNavPrefetchProps(item.href, prefetchFinancialNav)}
                            title={collapsed ? navLabel : undefined}
                            aria-label={collapsed ? navLabel : undefined}
                            className={navRowClass(active)}
                          >
                            {Icon ? (
                              <Icon className={navIconClass(active)} strokeWidth={1.75} />
                            ) : null}
                            {!collapsed && <span className="truncate">{navLabel}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* System Health warning indicator */}
          {systemHealth.status === "warning" && (
            <div className="mt-6 flex flex-col gap-1">
              <Link
                href="/system-health"
                onClick={onNavigate}
                className={navRowClass(isActive("/system-health"))}
                title="System Health"
              >
                <AlertTriangle
                  className={navIconClass(
                    isActive("/system-health"),
                    "text-amber-500 group-hover:text-amber-600"
                  )}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {!collapsed && <span className="truncate">⚠ System Health</span>}
              </Link>
            </div>
          )}

          {/* Documents & Settings */}
          <div className="mt-6 flex flex-col gap-1">
            {standaloneItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={navRowClass(active)}
                >
                  {Icon ? <Icon className={navIconClass(active)} strokeWidth={1.75} /> : null}
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User footer */}
      {!collapsed && (
        <div className="border-t border-gray-100 px-3 py-3 dark:border-border">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 shrink-0 rounded-md">
              <AvatarFallback className="rounded-md bg-gray-100 text-[11px] font-medium text-text-secondary dark:bg-muted/50">
                U
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight text-text-primary dark:text-foreground">
                User
              </p>
              <p className="truncate text-[11px] text-[#9CA3AF] dark:text-muted-foreground">
                Admin
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Collapse button at bottom */}
      <div className="border-t border-gray-100 p-2 dark:border-border">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "flex w-full items-center rounded-md text-sm font-medium text-text-secondary transition-colors duration-150 ease-out hover:bg-gray-50 hover:text-text-primary dark:text-muted-foreground dark:hover:bg-muted/40 dark:hover:text-foreground",
            collapsed ? "min-h-[44px] justify-center px-2 py-2 sm:min-h-8" : "gap-2 px-2 py-1.5"
          )}
          aria-label="Collapse sidebar"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
