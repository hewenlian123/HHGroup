"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FolderKanban, Clock, Receipt, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV_ROUTES, prefetchRoutes, runWhenIdle } from "@/lib/route-prefetch";

const items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/labor", label: "Labor", icon: Clock },
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
  Icon: React.ComponentType<{ className?: string }>;
  pathname: string | null;
}) {
  const router = useRouter();
  const isActive =
    pathname === href || (href !== "/dashboard" && pathname != null && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      prefetch
      onPointerDown={() => router.prefetch(href)}
      className={cn(
        "flex min-h-[44px] min-w-[40px] flex-1 flex-col items-center justify-center gap-0.5 text-xs touch-manipulation cursor-pointer",
        "transition-[color,transform,opacity] duration-75 active:opacity-80 active:scale-[0.97]",
        isActive ? "text-foreground font-medium" : "text-muted-foreground"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon className="h-5 w-5 shrink-0 pointer-events-none" />
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
        "flex h-14 items-center justify-around border-t border-border bg-white print:hidden dark:bg-background",
        className
      )}
      aria-label="Bottom navigation"
    >
      {items.map((item) => (
        <BottomNavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} pathname={pathname} />
      ))}
    </nav>
  );
}
