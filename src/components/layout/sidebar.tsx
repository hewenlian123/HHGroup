"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Receipt,
  Banknote,
  ShoppingCart,
  Wallet,
  Users,
  FileStack,
  Settings,
  Building2,
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
  Calculator,
  FilePen,
  AlertTriangle,
  Activity,
  BarChart2,
  ScrollText,
  Archive,
  Landmark,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createBrowserClient } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readStoredExpenseSort } from "@/lib/expense-list-sort-storage";
import { countExpensesMatchingInboxPool } from "@/lib/expense-workflow-status";
import { prefetchFinancialRoute } from "@/lib/financial-nav-prefetch";
import { OWNER_NAV_PREFETCH_ROUTES, prefetchRoutes, runWhenIdle } from "@/lib/route-prefetch";
import { companyProfileQueryKey, fetchCompanyProfileForNav } from "@/lib/queries/companyProfile";
import {
  buildExpensesQueryKey,
  expenseListQueryStaleMs,
  expensesQueryKeyRoot,
  fetchExpenses,
} from "@/lib/queries/expenses";
import { RECEIPT_QUEUE_CHANGED_EVENT } from "@/lib/receipt-queue";
import { getCompanyInitials } from "@/lib/company-profile";
import { useSystemHealth } from "@/contexts/system-health-context";
import {
  HH_PROJECT_OS_DEFAULT_OPEN_SECTIONS,
  HH_PROJECT_OS_NAV_SECTIONS,
  HH_PROJECT_OS_SECTION_KEYS,
  isHhProjectOsNavItem,
  isHhProjectOsNavPlaceholder,
  type HhProjectOsIconKey,
  type HhProjectOsNavItem,
  type HhProjectOsNavPlaceholder,
} from "@/lib/navigation/ia";

const STORAGE_KEY = "hh.sidebarSections";

const NAV_ICON_MAP: Record<HhProjectOsIconKey, LucideIcon> = {
  accounts: Wallet,
  activity: Activity,
  ar: CircleDollarSign,
  backups: Archive,
  bank: Landmark,
  bills: Receipt,
  cashflow: Banknote,
  changeOrders: FilePen,
  commission: Percent,
  company: Building2,
  customers: Users,
  dashboard: LayoutDashboard,
  deposits: Banknote,
  documents: FileStack,
  estimates: FileText,
  expenses: ShoppingCart,
  financial: CircleDollarSign,
  inspection: ClipboardCheck,
  invoice: FileText,
  logs: ScrollText,
  materials: Package,
  metrics: BarChart2,
  payments: CircleDollarSign,
  payroll: Calculator,
  photos: Camera,
  preferences: Settings,
  projects: FolderKanban,
  punchList: ListChecks,
  receipts: ReceiptText,
  reimbursements: ReceiptText,
  roles: ShieldCheck,
  schedule: Calendar,
  settings: Settings,
  subcontractors: Users,
  tasks: CheckSquare,
  users: UserCog,
  vendors: Users,
  workerAdvances: CircleDollarSign,
  workerBalances: Wallet,
  workerInvoices: FileText,
  workerPayments: CircleDollarSign,
  workerSummary: BarChart2,
  workers: Users,
};

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

function navIntentPrefetchProps(
  href: string,
  run: (h: string) => void
): { onFocus: () => void; onPointerDown: () => void; onPointerEnter: () => void } {
  const prefetch = () => run(href);
  return { onFocus: prefetch, onPointerDown: prefetch, onPointerEnter: prefetch };
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefetchedNavRoutesRef = React.useRef<Set<string>>(new Set());
  const prefetchSupabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);
  const prefetchFinancialNav = React.useCallback(
    (href: string) => prefetchFinancialRoute(queryClient, prefetchSupabase, href),
    [queryClient, prefetchSupabase]
  );
  const prefetchNavRoute = React.useCallback(
    (href: string) => {
      if (!prefetchedNavRoutesRef.current.has(href)) {
        prefetchedNavRoutesRef.current.add(href);
        try {
          router.prefetch(href);
        } catch {
          // Best-effort route warming only.
        }
      }
      prefetchFinancialNav(href);
    },
    [prefetchFinancialNav, router]
  );
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => ({}));
  const { data: companyProfile } = useQuery({
    queryKey: companyProfileQueryKey,
    queryFn: () => fetchCompanyProfileForNav(prefetchSupabase!),
    enabled: Boolean(prefetchSupabase),
    staleTime: 5 * 60_000,
    refetchOnMount: false,
  });
  const orgName = companyProfile?.org_name?.trim() || "HH Group";
  const logoUrl = companyProfile?.logo_url ?? null;

  const expenseSortForInboxBadge = readStoredExpenseSort();
  const { data: expenseInboxPoolCount = 0 } = useQuery({
    queryKey: buildExpensesQueryKey(expenseSortForInboxBadge),
    queryFn: () => fetchExpenses(expenseSortForInboxBadge),
    select: (rows) => countExpensesMatchingInboxPool(rows),
    enabled: Boolean(prefetchSupabase),
    staleTime: expenseListQueryStaleMs,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const expenseInboxPoolAnimKey = useReceiptQueueCountAnimKey(expenseInboxPoolCount);
  const sectionsInitDone = React.useRef(false);

  React.useEffect(() => {
    return runWhenIdle(() => {
      for (const href of OWNER_NAV_PREFETCH_ROUTES) {
        prefetchedNavRoutesRef.current.add(href);
      }
      prefetchRoutes(router, OWNER_NAV_PREFETCH_ROUTES);
    }, 2500);
  }, [router]);

  const itemMatchesPath = React.useCallback(
    (item: HhProjectOsNavItem) => {
      const matchesHref = (href: string) =>
        item.exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
      if (
        (item.excludePaths ?? []).some(
          (href) => pathname === href || pathname.startsWith(href + "/")
        )
      ) {
        return false;
      }
      return matchesHref(item.href) || (item.aliases ?? []).some((href) => matchesHref(href));
    },
    [pathname]
  );

  const activeSectionKey = React.useMemo(() => {
    for (const section of HH_PROJECT_OS_NAV_SECTIONS) {
      if (section.entries.some((entry) => isHhProjectOsNavItem(entry) && itemMatchesPath(entry))) {
        return section.key;
      }
    }
    return null;
  }, [itemMatchesPath]);

  React.useEffect(() => {
    const onQueue = () => {
      void queryClient.invalidateQueries({
        queryKey: expensesQueryKeyRoot,
        refetchType: "active",
      });
    };
    window.addEventListener(RECEIPT_QUEUE_CHANGED_EVENT, onQueue);
    return () => window.removeEventListener(RECEIPT_QUEUE_CHANGED_EVENT, onQueue);
  }, [queryClient]);

  React.useEffect(() => {
    if (sectionsInitDone.current) return;
    sectionsInitDone.current = true;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobileOrTablet) {
      const allClosed = HH_PROJECT_OS_SECTION_KEYS.reduce(
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
          setOpenSections({ ...HH_PROJECT_OS_DEFAULT_OPEN_SECTIONS, ...parsed });
          return;
        }
      }
    } catch {
      // ignore
    }
    setOpenSections(HH_PROJECT_OS_DEFAULT_OPEN_SECTIONS);
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
  const navLabelForItem = React.useCallback(
    (item: HhProjectOsNavItem) =>
      item.badge === "expenseInbox" ? `${item.label} (${expenseInboxPoolCount})` : item.label,
    [expenseInboxPoolCount]
  );

  /** Nav row: inactive label always readable; hover adjusts background only. */
  const navRowClass = (active: boolean) =>
    cn(
      "group relative flex items-center rounded-md text-[13px] transition-[background-color] duration-200 ease-out touch-manipulation",
      collapsed
        ? "min-h-[44px] justify-center px-2 py-1.5 lg:min-h-0"
        : "max-lg:min-h-[44px] min-h-0 gap-2.5 px-2 py-1.5 lg:min-h-0",
      active
        ? cn(
            "font-medium text-white",
            "bg-[rgb(184_147_90_/_0.12)] hover:bg-[rgb(184_147_90_/_0.17)]",
            "before:absolute before:inset-y-2 before:left-0 before:w-px before:rounded-full before:bg-[var(--neo-gold-soft)] before:content-['']"
          )
        : "font-normal text-zinc-300 hover:bg-white/[0.038] active:bg-white/[0.055]"
    );

  const navIconClass = (active: boolean, extra?: string) =>
    cn(
      "h-[15px] w-[15px] shrink-0",
      active ? "text-[var(--neo-gold-soft)]" : "text-zinc-300",
      extra
    );

  const renderNavItem = (item: HhProjectOsNavItem, options?: { iconOnly?: boolean }) => {
    const active = itemMatchesPath(item);
    const isSystemHealthWarning =
      item.badge === "systemHealth" && systemHealth.status === "warning";
    const Icon = isSystemHealthWarning ? AlertTriangle : NAV_ICON_MAP[item.icon];
    const iconClass = isSystemHealthWarning
      ? cn("h-[15px] w-[15px] shrink-0", active ? "text-amber-300" : "text-amber-400")
      : navIconClass(active);
    const iconOnly = options?.iconOnly ?? false;
    const navLabel = navLabelForItem(item);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        {...navIntentPrefetchProps(item.href, prefetchNavRoute)}
        title={iconOnly ? navLabel : undefined}
        aria-label={iconOnly ? navLabel : undefined}
        className={navRowClass(active)}
      >
        {item.badge === "expenseInbox" && iconOnly ? (
          <div className="relative flex shrink-0 items-center justify-center">
            <Icon className={iconClass} strokeWidth={1.75} />
            {expenseInboxPoolCount > 0 ? (
              <span
                key={expenseInboxPoolAnimKey}
                className={cn(
                  "absolute -right-2 -top-1 z-[1] flex min-h-[15px] min-w-[15px] items-center justify-center rounded-sm px-1 text-[10px] font-semibold tabular-nums leading-none animate-receipt-queue-badge",
                  active ? "text-[var(--neo-gold-soft)]" : "text-zinc-100"
                )}
                aria-hidden
              >
                {expenseInboxPoolCount > 99 ? "99+" : expenseInboxPoolCount}
              </span>
            ) : null}
          </div>
        ) : (
          <Icon className={iconClass} strokeWidth={1.75} />
        )}
        {!iconOnly && (
          <span className="flex min-w-0 flex-1 items-baseline gap-0">
            <span className="truncate">{item.label}</span>
            {item.badge === "expenseInbox" ? (
              <span
                key={expenseInboxPoolAnimKey}
                className="inline-block shrink-0 origin-center rounded-sm px-0.5 tabular-nums animate-receipt-queue-badge"
              >
                {" "}
                ({expenseInboxPoolCount})
              </span>
            ) : null}
          </span>
        )}
      </Link>
    );
  };

  const renderNavPlaceholder = (
    item: HhProjectOsNavPlaceholder,
    options?: { iconOnly?: boolean }
  ) => {
    const Icon = NAV_ICON_MAP[item.icon];
    const iconOnly = options?.iconOnly ?? false;
    const label = item.note ? `${item.label}: ${item.note}` : item.label;

    return (
      <div
        key={`placeholder-${item.label}`}
        aria-disabled="true"
        title={label}
        className={cn(
          "group relative flex items-center rounded-md text-[13px] text-zinc-500",
          "cursor-default select-none",
          collapsed
            ? "min-h-[44px] justify-center px-2 py-1.5 lg:min-h-0"
            : "max-lg:min-h-[44px] min-h-0 gap-2.5 px-2 py-1.5 lg:min-h-0"
        )}
      >
        <Icon className="h-[15px] w-[15px] shrink-0 text-zinc-500" strokeWidth={1.75} />
        {!iconOnly && (
          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
            <span className="truncate">{item.label}</span>
            {item.note ? (
              <span className="shrink-0 rounded-sm border border-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-zinc-500">
                Future
              </span>
            ) : null}
          </span>
        )}
      </div>
    );
  };

  return (
    <aside
      data-app-sidebar
      className={cn(
        "neo-sidebar relative flex h-full shrink-0 flex-col overflow-hidden",
        collapsed ? "w-[72px]" : "w-[210px]",
        className
      )}
    >
      <div
        className={cn(
          "relative z-[1] flex h-12 items-center gap-2 border-b border-white/[0.08] bg-white/[0.035] backdrop-blur-sm",
          collapsed ? "px-3" : "px-3"
        )}
      >
        <Avatar className="h-7 w-7 rounded-md ring-1 ring-inset ring-white/10">
          {logoUrl ? <AvatarImage src={logoUrl} alt={orgName} className="object-contain" /> : null}
          <AvatarFallback className="rounded-md bg-white/[0.08] text-[11px] font-semibold text-zinc-100">
            {getCompanyInitials(orgName)}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
              HH Unified
            </p>
            <p className="truncate text-[13px] font-medium tracking-normal text-zinc-100">
              {orgName}
            </p>
          </div>
        )}
      </div>

      <nav
        className={cn(
          "relative z-[1] flex-1 overflow-y-auto",
          // Hide scrollbar chrome (keep scroll) for a cleaner SaaS feel
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          collapsed ? "px-2 py-3" : "px-2 py-3"
        )}
      >
        <div className={cn("flex flex-col", collapsed && "gap-1")}>
          {HH_PROJECT_OS_NAV_SECTIONS.map((section, sectionIndex) => {
            const isOpen = openSections[section.key] ?? false;
            const standaloneEntry =
              section.key === "REPORTS" &&
              section.entries.length === 1 &&
              isHhProjectOsNavItem(section.entries[0])
                ? section.entries[0]
                : null;
            if (standaloneEntry) {
              return (
                <div key={section.key} className={cn("flex flex-col", sectionIndex > 0 && "mt-6")}>
                  {renderNavItem(standaloneEntry, { iconOnly: collapsed })}
                </div>
              );
            }
            if (collapsed) {
              return (
                <div
                  key={section.key}
                  className={cn("flex flex-col gap-1", sectionIndex > 0 && "mt-6")}
                >
                  {section.entries.map((entry) => {
                    if (isHhProjectOsNavItem(entry)) {
                      return renderNavItem(entry, { iconOnly: true });
                    }
                    if (isHhProjectOsNavPlaceholder(entry)) {
                      return renderNavPlaceholder(entry, { iconOnly: true });
                    }
                    return null;
                  })}
                </div>
              );
            }
            return (
              <div key={section.key} className={cn("flex flex-col", sectionIndex > 0 && "mt-6")}>
                <button
                  type="button"
                  onClick={() => setSectionOpen(section.key, !isOpen)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-300 transition-[background-color] duration-150 ease-out hover:bg-white/[0.045] active:bg-white/[0.06] lg:min-h-0"
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
                      {section.entries.map((entry, entryIndex) => {
                        if (isHhProjectOsNavItem(entry)) return renderNavItem(entry);
                        if (isHhProjectOsNavPlaceholder(entry)) {
                          return renderNavPlaceholder(entry);
                        }
                        return (
                          <div
                            key={`${section.key}-${entry.label}`}
                            className={cn(
                              "px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500",
                              entryIndex > 0 && "pt-3"
                            )}
                          >
                            {entry.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>

      {/* User footer */}
      {!collapsed && (
        <div className="relative z-[1] border-t border-white/[0.08] px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-md border border-white/[0.06] bg-white/[0.028] px-2.5 py-2 backdrop-blur-sm">
            <Avatar className="h-8 w-8 shrink-0 rounded-md ring-1 ring-inset ring-white/[0.08]">
              <AvatarFallback className="rounded-md bg-white/[0.06] text-[11px] font-medium text-zinc-200">
                U
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight text-zinc-100">User</p>
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
                Admin
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Collapse button at bottom */}
      <div className="relative z-[1] border-t border-white/[0.08] p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "flex w-full items-center rounded-md text-sm font-medium text-zinc-300 transition-[background-color] duration-150 ease-out hover:bg-white/[0.05]",
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
