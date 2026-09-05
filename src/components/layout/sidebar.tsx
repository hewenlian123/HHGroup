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
import { TYPO } from "@/lib/typography";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createBrowserClient } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { prefetchFinancialRoute } from "@/lib/financial-nav-prefetch";
import {
  OWNER_NAV_PREFETCH_ROUTES,
  prefetchRoutes,
  runWhenIdle,
  shouldBulkPrefetchOwnerNav,
} from "@/lib/route-prefetch";
import { companyProfileQueryKey, fetchCompanyProfileForNav } from "@/lib/queries/companyProfile";
import { getCompanyInitials } from "@/lib/company-profile";
import { useSystemHealth } from "@/contexts/system-health-context";
import { useAuth } from "@/components/auth/auth-provider";
import { authIdentityRoleLabel } from "@/components/auth/auth-ui";
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
  const { initialized: authInitialized, role: authRole, user: authUser } = useAuth();
  const bulkPrefetchEnabled = shouldBulkPrefetchOwnerNav(pathname);
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
  React.useEffect(() => {
    if (pathname !== "/dashboard" || onNavigate) return;
    return runWhenIdle(() => {
      if (window.matchMedia("(min-width: 640px)").matches) {
        prefetchNavRoute("/projects");
      }
    }, 600);
  }, [pathname, onNavigate, prefetchNavRoute]);
  const { data: companyProfile } = useQuery({
    queryKey: companyProfileQueryKey,
    queryFn: () => fetchCompanyProfileForNav(prefetchSupabase!),
    enabled: Boolean(prefetchSupabase),
    staleTime: 5 * 60_000,
    refetchOnMount: false,
  });
  const orgName = companyProfile?.org_name?.trim() || "HH Group";
  const logoUrl = companyProfile?.logo_url ?? null;
  const accountName = authUser?.email?.trim() || (authInitialized ? "Not signed in" : "Loading…");
  const accountRole = authInitialized
    ? authIdentityRoleLabel(authRole, Boolean(authUser))
    : "Checking session";
  const accountInitial = authUser?.email?.trim().charAt(0).toUpperCase() || "?";

  const sectionsInitDone = React.useRef(false);

  React.useEffect(() => {
    if (!bulkPrefetchEnabled) return;
    let cancelPrefetch: (() => void) | undefined;
    const cancelIdle = runWhenIdle(() => {
      for (const href of OWNER_NAV_PREFETCH_ROUTES) {
        prefetchedNavRoutesRef.current.add(href);
      }
      cancelPrefetch = prefetchRoutes(router, OWNER_NAV_PREFETCH_ROUTES);
    }, 2500);
    return () => {
      cancelIdle();
      cancelPrefetch?.();
    };
  }, [bulkPrefetchEnabled, router]);

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
  /** Nav row: inactive label always readable; hover adjusts background only. */
  const navRowClass = (active: boolean) =>
    cn(
      "group relative flex touch-manipulation items-center rounded-hh-standard transition-[background-color,color] duration-150 ease-out",
      TYPO.tableCell,
      collapsed
        ? "min-h-[44px] justify-center px-2 lg:h-9 lg:min-h-9"
        : "min-h-[44px] gap-2.5 px-2.5 lg:h-9 lg:min-h-9",
      active
        ? "bg-[var(--hh-surface-selected)] font-medium text-[var(--hh-accent-hover)] before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--hh-accent-primary)] hover:bg-[var(--hh-accent-soft)]"
        : "font-normal text-[var(--hh-text-secondary)] hover:bg-[var(--hh-surface-hover)] active:bg-[var(--hh-accent-soft)]"
    );

  const navIconClass = (active: boolean, extra?: string) =>
    cn(
      "h-[15px] w-[15px] shrink-0",
      active ? "text-[var(--hh-accent-primary)]" : "text-[var(--hh-text-muted)]",
      extra
    );

  const renderNavItem = (item: HhProjectOsNavItem, options?: { iconOnly?: boolean }) => {
    const active = itemMatchesPath(item);
    const isSystemHealthWarning =
      item.badge === "systemHealth" && systemHealth.status === "warning";
    const Icon = isSystemHealthWarning ? AlertTriangle : NAV_ICON_MAP[item.icon];
    const iconClass = isSystemHealthWarning
      ? "h-[15px] w-[15px] shrink-0 text-[var(--hh-warning)]"
      : navIconClass(active);
    const iconOnly = options?.iconOnly ?? false;
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        onClick={onNavigate}
        {...navIntentPrefetchProps(item.href, prefetchNavRoute)}
        title={iconOnly ? item.label : undefined}
        aria-label={iconOnly ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={navRowClass(active)}
      >
        <Icon className={iconClass} strokeWidth={1.75} />
        {!iconOnly && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
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
          "group relative flex items-center rounded-hh-standard text-[var(--hh-text-muted)]",
          TYPO.tableCell,
          "cursor-default select-none",
          collapsed
            ? "min-h-[44px] justify-center px-2 lg:h-9 lg:min-h-9"
            : "min-h-[44px] gap-2.5 px-2.5 lg:h-9 lg:min-h-9"
        )}
      >
        <Icon
          className="h-[15px] w-[15px] shrink-0 text-[var(--hh-text-muted)]"
          strokeWidth={1.75}
        />
        {!iconOnly && (
          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
            <span className="truncate">{item.label}</span>
            {item.note ? (
              <span
                className={cn(
                  "shrink-0 rounded-hh-compact border border-[var(--hh-border)] px-1.5 py-0.5",
                  TYPO.tableHeader
                )}
              >
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
        "relative flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--hh-border-subtle)] bg-[var(--hh-surface-workspace)] text-[var(--hh-text-primary)] shadow-none",
        collapsed ? "w-hh-sidebar-collapsed" : "w-hh-sidebar-expanded",
        className
      )}
    >
      <div
        data-sidebar-brand
        className={cn(
          "relative z-[1] flex h-14 min-h-14 items-center gap-2 border-b border-[var(--hh-border-subtle)] bg-[var(--hh-surface-workspace)]",
          collapsed ? "px-3" : "px-3"
        )}
      >
        <div data-sidebar-standard-brand className="contents">
          <Avatar className="h-8 w-8 rounded-md ring-1 ring-inset ring-[var(--hh-border-default)]">
            {logoUrl ? (
              <AvatarImage src={logoUrl} alt={orgName} className="object-contain" />
            ) : null}
            <AvatarFallback
              className={cn(
                "rounded-md bg-[var(--hh-surface-subtle)] text-[var(--hh-text-primary)]",
                TYPO.tableHeader
              )}
            >
              {getCompanyInitials(orgName)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0">
              <p className={cn("truncate", TYPO.tableHeader)}>HH Unified</p>
              <p className={cn("truncate", TYPO.primaryName)}>{orgName}</p>
            </div>
          )}
        </div>
      </div>

      <nav
        data-sidebar-navigation
        className={cn(
          "relative z-[1] flex-1 overflow-y-auto",
          // Hide scrollbar chrome (keep scroll) for a cleaner SaaS feel
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "px-2 py-3"
        )}
      >
        <div className={cn("flex flex-col", collapsed && "gap-1")}>
          {HH_PROJECT_OS_NAV_SECTIONS.map((section, sectionIndex) => {
            const isOpen = openSections[section.key] ?? false;
            if (collapsed) {
              return (
                <div
                  key={section.key}
                  className={cn("flex flex-col gap-1", sectionIndex > 0 && "mt-4")}
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
              <div key={section.key} className={cn("flex flex-col", sectionIndex > 0 && "mt-4")}>
                <button
                  type="button"
                  onClick={() => setSectionOpen(section.key, !isOpen)}
                  className={cn(
                    "flex min-h-[44px] w-full items-center gap-2 rounded-hh-standard px-2.5 text-left text-[var(--hh-text-muted)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--hh-surface-hover)] hover:text-[var(--hh-text-secondary)] active:bg-[var(--hh-accent-soft)] lg:h-9 lg:min-h-9",
                    TYPO.tableHeader
                  )}
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
                            className={cn("px-2 pb-1", TYPO.tableHeader, entryIndex > 0 && "pt-3")}
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
        <div
          data-sidebar-account
          className="relative z-[1] border-t border-[var(--hh-border-subtle)] px-3 py-3"
        >
          <div className="flex min-h-11 items-center gap-2.5 rounded-hh-standard bg-[var(--hh-surface-section)] px-2.5 py-2">
            <Avatar className="h-8 w-8 shrink-0 rounded-md ring-1 ring-inset ring-[var(--hh-border-default)]">
              <AvatarFallback
                className={cn(
                  "rounded-md bg-[var(--hh-surface-workspace)] text-[var(--hh-text-secondary)]",
                  TYPO.tableHeader
                )}
              >
                {accountInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate", TYPO.primaryName)}>{accountName}</p>
              <p className={cn("truncate", TYPO.tableHeader)}>{accountRole}</p>
            </div>
          </div>
        </div>
      )}

      {/* Collapse button at bottom */}
      <div
        data-sidebar-collapse
        className="relative z-[1] border-t border-[var(--hh-border-subtle)] p-2"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "flex min-h-[44px] w-full items-center rounded-hh-standard text-[var(--hh-text-muted)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--hh-surface-hover)] hover:text-[var(--hh-text-secondary)] lg:h-9 lg:min-h-9",
            TYPO.button,
            collapsed ? "justify-center px-2" : "gap-2 px-2.5"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
