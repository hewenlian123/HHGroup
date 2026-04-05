"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Clock,
  Receipt,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { prefetchFinancialRoute } from "@/lib/financial-nav-prefetch";
import { createBrowserClient } from "@/lib/supabase";
import { BOTTOM_NAV_ROUTES, prefetchRoutes, runWhenIdle } from "@/lib/route-prefetch";

const items: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/labor", label: "Time Entries", icon: Clock },
  { href: "/financial/expenses", label: "Expenses", icon: Receipt },
  { href: "/documents", label: "More", icon: MoreHorizontal },
];

const BottomNavItem = React.memo(function BottomNavItem({
  href,
  label,
  Icon,
  pathname,
  onPointerEnterNav,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  pathname: string | null;
  onPointerEnterNav?: () => void;
}) {
  const router = useRouter();
  const isActive =
    pathname === href ||
    (href !== "/dashboard" && pathname != null && pathname.startsWith(href + "/"));

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
        "transition-[color,transform,opacity] duration-75 active:opacity-80 active:scale-[0.97]",
        isActive
          ? "font-semibold text-text-primary dark:text-foreground"
          : "text-text-secondary dark:text-muted-foreground"
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
        "flex h-14 items-center justify-around border-t border-gray-300 [border-top-width:0.5px] bg-white print:hidden dark:border-border dark:bg-background",
        className
      )}
      aria-label="Bottom navigation"
    >
      {items.map((item) => (
        <BottomNavItem
          key={item.href}
          href={item.href}
          label={item.label}
          Icon={item.icon}
          pathname={pathname}
          onPointerEnterNav={
            item.href === "/financial/expenses"
              ? () => prefetchFinancialRoute(queryClient, prefetchSupabase, item.href)
              : undefined
          }
        />
      ))}
    </nav>
  );
}
