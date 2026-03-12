"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, Clock, Receipt, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/labor", label: "Labor", icon: Clock },
  { href: "/financial/expenses", label: "Expenses", icon: Receipt },
  { href: "/documents", label: "More", icon: MoreHorizontal },
];

export function BottomNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex h-14 items-center justify-around border-t border-border bg-white print:hidden dark:bg-background",
        className
      )}
      aria-label="Bottom navigation"
    >
      {items.map((item) => {
        const isActive =
          pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-[44px] min-w-[40px] flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors",
              isActive ? "text-foreground font-medium" : "text-muted-foreground"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
