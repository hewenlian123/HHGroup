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
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { prefetchFinancialRoute } from "@/lib/financial-nav-prefetch";
import { createBrowserClient } from "@/lib/supabase";
import { BOTTOM_NAV_ROUTES, prefetchRoutes, runWhenIdle } from "@/lib/route-prefetch";
import { HH_PROJECT_OS_MOBILE_NAV_ITEMS, type HhProjectOsIconKey } from "@/lib/navigation/ia";

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
  metrics: LayoutDashboard,
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
  aliases,
  pathname,
  onPointerEnterNav,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  aliases?: readonly string[];
  pathname: string | null;
  onPointerEnterNav?: () => void;
}) {
  const router = useRouter();
  const matchesNavPath = React.useCallback(
    (target: string) =>
      pathname === target ||
      (target !== "/dashboard" && pathname != null && pathname.startsWith(target + "/")),
    [pathname]
  );
  const isActive = matchesNavPath(href) || (aliases ?? []).some((alias) => matchesNavPath(alias));

  return (
    <Link
      href={href}
      prefetch
      onPointerDown={() => {
        onPointerEnterNav?.();
        router.prefetch(href);
      }}
      onPointerEnter={onPointerEnterNav}
      className={cn(
        "flex min-h-[44px] min-w-[40px] flex-1 flex-col items-center justify-center gap-0.5 text-xs touch-manipulation cursor-pointer",
        "transition-[color_transform_opacity] duration-75 active:opacity-80 active:scale-[0.97]",
        isActive ? "font-medium text-[var(--neo-gold)]" : "text-sm text-[var(--neo-text-secondary)]"
      )}
      aria-current={isActive ? "page" : undefined}
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
    return runWhenIdle(() => prefetchRoutes(router, [...BOTTOM_NAV_ROUTES]));
  }, [router]);

  return (
    <nav
      className={cn(
        "dark neo-command-bar flex min-h-14 items-center justify-around rounded-t-xl border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] print:hidden sm:rounded-none",
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
          aliases={"aliases" in item ? item.aliases : undefined}
          pathname={pathname}
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
