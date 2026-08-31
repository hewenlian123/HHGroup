"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CircleDollarSign,
  FileStack,
  Users,
  BarChart2,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { prefetchFinancialRoute } from "@/lib/financial-nav-prefetch";
import { createBrowserClient } from "@/lib/supabase";
import {
  BOTTOM_NAV_ROUTES,
  BOTTOM_NAV_VISIBLE_MEDIA_QUERY,
  prefetchRoutes,
  runWhenIdle,
  shouldBulkPrefetchMobileNav,
} from "@/lib/route-prefetch";
import {
  HH_PROJECT_OS_MOBILE_NAV_ITEMS,
  getHhProjectOsMobileActiveHref,
  type HhProjectOsIconKey,
} from "@/lib/navigation/ia";

const MOBILE_ICON_MAP: Record<HhProjectOsIconKey, LucideIcon> = {
  accounts: CircleDollarSign,
  activity: LayoutDashboard,
  ar: CircleDollarSign,
  backups: FileStack,
  bank: CircleDollarSign,
  bills: CircleDollarSign,
  cashflow: CircleDollarSign,
  changeOrders: FolderKanban,
  commission: CircleDollarSign,
  company: FileStack,
  customers: Users,
  dashboard: LayoutDashboard,
  deposits: CircleDollarSign,
  documents: FileStack,
  estimates: FolderKanban,
  expenses: CircleDollarSign,
  financial: CircleDollarSign,
  inspection: FileStack,
  invoice: CircleDollarSign,
  logs: FileStack,
  materials: FolderKanban,
  metrics: BarChart2,
  payments: CircleDollarSign,
  payroll: CircleDollarSign,
  photos: FileStack,
  preferences: FileStack,
  projects: FolderKanban,
  punchList: FolderKanban,
  receipts: FileStack,
  reimbursements: CircleDollarSign,
  roles: Users,
  schedule: FolderKanban,
  settings: FileStack,
  subcontractors: Users,
  tasks: FolderKanban,
  users: Users,
  vendors: Users,
  workerAdvances: CircleDollarSign,
  workerBalances: CircleDollarSign,
  workerInvoices: CircleDollarSign,
  workerPayments: CircleDollarSign,
  workerSummary: Users,
  workers: Users,
};

const BottomNavItem = React.memo(function BottomNavItem({
  href,
  label,
  Icon,
  active,
  onPointerEnterNav,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  onPointerEnterNav?: () => void;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      prefetch={false}
      onPointerDown={() => {
        onPointerEnterNav?.();
        router.prefetch(href);
      }}
      onPointerEnter={onPointerEnterNav}
      className={cn(
        "flex min-h-[44px] min-w-[40px] flex-1 touch-manipulation cursor-pointer flex-col items-center justify-center gap-0.5 rounded-hh-standard text-xs",
        "transition-[background-color,color,opacity] duration-100 active:bg-[var(--hh-l3-pressed)] active:opacity-80",
        active
          ? "bg-[var(--hh-surface-selected)] font-medium text-[var(--hh-accent-primary)]"
          : "text-sm text-[var(--hh-text-muted)] hover:bg-[var(--hh-surface-hover)] hover:text-[var(--hh-text-secondary)]"
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-[18px] w-[18px] shrink-0 pointer-events-none" strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </Link>
  );
});

export function BottomNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefetchSupabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  React.useEffect(() => {
    let cancelPrefetch: (() => void) | undefined;
    const cancelIdle = runWhenIdle(() => {
      const mobileNavigationVisible = window.matchMedia(BOTTOM_NAV_VISIBLE_MEDIA_QUERY).matches;
      if (!shouldBulkPrefetchMobileNav(pathname, mobileNavigationVisible)) return;
      cancelPrefetch = prefetchRoutes(router, [...BOTTOM_NAV_ROUTES]);
    });
    return () => {
      cancelIdle();
      cancelPrefetch?.();
    };
  }, [pathname, router]);

  const activeHref = getHhProjectOsMobileActiveHref(pathname);

  return (
    <nav
      className={cn(
        "flex min-h-14 items-center justify-around gap-1 border-t border-[var(--hh-border-default)] bg-[var(--hh-surface-workspace)] px-1 pb-[env(safe-area-inset-bottom)] print:hidden",
        className
      )}
      aria-label="Bottom navigation"
    >
      {HH_PROJECT_OS_MOBILE_NAV_ITEMS.map((item) => (
        <BottomNavItem
          key={item.href}
          href={item.href}
          label={item.label}
          Icon={MOBILE_ICON_MAP[item.icon]}
          active={activeHref === item.href}
          onPointerEnterNav={
            item.href.startsWith("/financial")
              ? () => prefetchFinancialRoute(queryClient, prefetchSupabase, item.href)
              : undefined
          }
        />
      ))}
    </nav>
  );
}
