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
import { cn } from "@/lib/utils";
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
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  pathname: string | null;
}) {
  const router = useRouter();
  const isActive =
    pathname === href ||
    (href !== "/dashboard" && pathname != null && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      prefetch
      onPointerDown={() => router.prefetch(href)}
      className={cn(
        "flex min-h-[44px] min-w-[40px] flex-1 flex-col items-center justify-center gap-0.5 text-xs touch-manipulation cursor-pointer",
        "transition-[color,transform,opacity] duration-75 active:opacity-80 active:scale-[0.97]",
        isActive
          ? "font-semibold text-[#2D2D2D] dark:text-foreground"
          : "text-gray-500 dark:text-muted-foreground"
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

  React.useEffect(() => {
    return runWhenIdle(() => prefetchRoutes(router, [...BOTTOM_NAV_ROUTES]));
  }, [router]);

  return (
    <nav
      className={cn(
        "flex h-14 items-center justify-around border-t border-[#EBEBE9] bg-[#F7F7F5] print:hidden dark:border-border dark:bg-background",
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
        />
      ))}
    </nav>
  );
}
