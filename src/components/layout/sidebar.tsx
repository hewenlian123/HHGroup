"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Receipt,
  Banknote,
  ShoppingCart,
  CreditCard,
  Clock,
  Wallet,
  UserPlus,
  Users,
  FileStack,
  Settings,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyInitials, getCompanyProfile } from "@/lib/company-profile";

type NavItem = { href: string; label: string; icon?: React.ComponentType<{ className?: string }> };

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: "PROJECTS",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/estimates", label: "Estimates", icon: FileText },
    ],
  },
  {
    label: "FINANCE",
    items: [
      { href: "/financial/invoices", label: "Invoices", icon: Receipt },
      { href: "/financial/payments", label: "Payments Received", icon: CircleDollarSign },
      { href: "/financial/deposits", label: "Deposits", icon: Landmark },
      { href: "/bills", label: "Bills", icon: Banknote },
      { href: "/financial/expenses", label: "Expenses", icon: ShoppingCart },
      { href: "/financial/accounts", label: "Accounts", icon: CreditCard },
    ],
  },
  {
    label: "LABOR",
    items: [
      { href: "/labor", label: "Daily Entry", icon: Clock },
      { href: "/workers", label: "Workers", icon: Users },
      { href: "/labor/reimbursements", label: "Reimbursements", icon: Receipt },
      { href: "/labor/worker-invoices", label: "Worker Invoices", icon: FileText },
      { href: "/labor/payroll", label: "Payroll Summary", icon: Wallet },
      { href: "/labor/payments", label: "Worker Payments", icon: CircleDollarSign },
    ],
  },
  {
    label: "PEOPLE",
    items: [
      { href: "/workers", label: "Workers", icon: UserPlus },
      { href: "/labor/subcontractors", label: "Vendors", icon: Users },
      { href: "/subcontractors", label: "Subcontractors", icon: Users },
    ],
  },
];

const standaloneItems: NavItem[] = [
  { href: "/documents", label: "Documents", icon: FileStack },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
  const [orgName, setOrgName] = React.useState("HH Group");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);

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

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  const linkClass = (active: boolean) =>
    cn(
      "flex h-8 items-center rounded-md text-sm transition-colors",
      collapsed ? "justify-center px-2" : "gap-2 px-2.5",
      active
        ? "bg-gray-100 text-[#111111] font-medium"
        : "text-[#6B7280] hover:bg-gray-50 hover:text-[#111111]"
    );

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-[#E5E7EB] bg-white",
        collapsed ? "w-16" : "w-[260px]",
        className
      )}
    >
      <div
        className={cn(
          "flex h-12 items-center gap-2 border-b border-[#E5E7EB]",
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
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-400">
              HH Unified
            </p>
            <p className="truncate text-sm font-semibold text-[#111111]">{orgName}</p>
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
            className={linkClass(isActive("/dashboard"))}
          >
            <LayoutDashboard className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </Link>
        </div>

        {/* Sections — 20px between sections, 4px between items */}
        <div className={cn("flex flex-col gap-4", collapsed && "gap-3")} style={{ marginTop: 16 }}>
          {sections.map((section) => (
            <div key={section.label} className="flex flex-col gap-0.5">
              {!collapsed && (
                <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {section.label}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      className={linkClass(active)}
                    >
                      {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : null}
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Documents & Settings */}
          <div className="flex flex-col gap-1">
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
                  className={linkClass(active)}
                >
                  {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : null}
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Collapse button at bottom */}
      <div className="border-t border-[#E5E7EB] p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "flex h-8 w-full items-center rounded-md text-sm text-[#6B7280] transition-colors hover:bg-gray-50 hover:text-[#111111]",
            collapsed ? "justify-center px-2" : "gap-2 px-2.5"
          )}
          aria-label="Collapse sidebar"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-[18px] w-[18px]" />
          ) : (
            <ChevronLeft className="h-[18px] w-[18px]" />
          )}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
