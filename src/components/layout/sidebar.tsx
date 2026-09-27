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
  HH_PROJECT_OS_NAV_SECTIONS,
  getHhProjectOsMobileActiveHref,
  type HhProjectOsIconKey,
  type HhProjectOsNavItem,
} from "@/lib/navigation/ia";

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

  const activeHref = getHhProjectOsMobileActiveHref(pathname);

  const { systemHealth } = useSystemHealth();
  /** Nav row: inactive label always readable; hover adjusts background only. */
  const navRowClass = (active: boolean) =>
    cn(
      "group relative flex touch-manipulation items-center rounded-hh-standard transition-[background-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]",
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
    const active = activeHref === item.href;
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

  return (
    <aside
      data-app-sidebar
      data-collapsed={collapsed ? "true" : "false"}
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
        aria-label="Workspaces"
        className={cn(
          "relative z-[1] flex-1 overflow-y-auto",
          // Hide scrollbar chrome (keep scroll) for a cleaner SaaS feel
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "px-2 py-3"
        )}
      >
        <div className="flex min-h-full flex-col gap-1">
          {HH_PROJECT_OS_NAV_SECTIONS.map((section) => (
            <div
              key={section.key}
              className={
                section.key === "SETTINGS"
                  ? "mt-auto border-t border-[var(--hh-border-subtle)] pt-3"
                  : undefined
              }
            >
              {renderNavItem(section, { iconOnly: collapsed })}
            </div>
          ))}
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
