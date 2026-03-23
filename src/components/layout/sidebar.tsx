"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Receipt,
  Banknote,
  ShoppingCart,
  Clock,
  Wallet,
  Users,
  FileStack,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDollarSign,
  CheckSquare,
  ListChecks,
  Calendar,
  Camera,
  ClipboardCheck,
  Boxes,
  Percent,
  Package,
  ReceiptText,
  Upload,
  Calculator,
  FilePen,
  AlertTriangle,
  Activity,
  FlaskConical,
  BarChart2,
  ScrollText,
  MonitorCheck,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyInitials, getCompanyProfile } from "@/lib/company-profile";
import { useSystemHealth } from "@/contexts/system-health-context";

const STORAGE_KEY = "hh.sidebarSections";

type NavItem = { href: string; label: string; icon?: LucideIcon };

const SECTION_KEYS = ["PROJECTS", "OPERATIONS", "FINANCE", "LABOR", "PEOPLE", "SYSTEM"] as const;

const sections: { key: (typeof SECTION_KEYS)[number]; label: string; items: NavItem[] }[] = [
  {
    key: "PROJECTS",
    label: "PROJECTS",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/estimates", label: "Estimates", icon: FileText },
      { href: "/change-orders", label: "Change Orders", icon: FilePen },
      { href: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    key: "OPERATIONS",
    label: "OPERATIONS",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/punch-list", label: "Punch List", icon: ListChecks },
      { href: "/schedule", label: "Schedule", icon: Calendar },
      { href: "/site-photos", label: "Site Photos", icon: Camera },
      { href: "/inspection-log", label: "Inspection Log", icon: ClipboardCheck },
      { href: "/materials/catalog", label: "Material Catalog", icon: Package },
    ],
  },
  {
    key: "FINANCE",
    label: "FINANCE",
    items: [
      { href: "/financial/invoices", label: "Invoices", icon: FileText },
      { href: "/financial/payments", label: "Payments Received", icon: CircleDollarSign },
      { href: "/financial/commissions", label: "Commission Payments", icon: Percent },
      { href: "/financial/deposits", label: "Deposits", icon: Banknote },
      { href: "/bills", label: "Bills", icon: Receipt },
      { href: "/financial/expenses", label: "Expenses", icon: ShoppingCart },
      { href: "/financial/accounts", label: "Accounts", icon: Wallet },
    ],
  },
  {
    key: "LABOR",
    label: "LABOR",
    items: [
      { href: "/labor", label: "Time Entries", icon: Clock },
      { href: "/labor/reimbursements", label: "Reimbursements", icon: ReceiptText },
      { href: "/labor/worker-balances", label: "Worker Balances", icon: Wallet },
      { href: "/labor/payments", label: "Worker Payments", icon: CircleDollarSign },
      { href: "/labor/advances", label: "Worker Advances", icon: CircleDollarSign },
      { href: "/labor/receipts", label: "Receipt Uploads", icon: Upload },
      { href: "/labor/worker-invoices", label: "Worker Invoices", icon: FileText },
      { href: "/labor/payroll", label: "Payroll Summary", icon: Calculator },
    ],
  },
  {
    key: "PEOPLE",
    label: "PEOPLE",
    items: [
      { href: "/workers", label: "Worker Profile", icon: Users },
      { href: "/workers/summary", label: "Worker Summary", icon: BarChart2 },
      { href: "/labor/subcontractors", label: "Vendors", icon: Users },
      { href: "/subcontractors", label: "Subcontractors", icon: Users },
    ],
  },
  {
    key: "SYSTEM",
    label: "SYSTEM",
    items: [
      { href: "/system-health", label: "System Health", icon: Activity },
      { href: "/system-tests", label: "System Tests", icon: FlaskConical },
      { href: "/system-tests/ui", label: "UI Tests", icon: MonitorCheck },
      { href: "/system-metrics", label: "System Metrics", icon: BarChart2 },
      { href: "/system-logs", label: "System Logs", icon: ScrollText },
      { href: "/system/backups", label: "Backups", icon: Archive },
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
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => ({}));
  const sectionsInitDone = React.useRef(false);

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

  React.useEffect(() => {
    if (sectionsInitDone.current) return;
    sectionsInitDone.current = true;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobileOrTablet) {
      const allClosed = SECTION_KEYS.reduce(
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
          setOpenSections(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    const allOpen = SECTION_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: true }),
      {} as Record<string, boolean>
    );
    setOpenSections(allOpen);
  }, []);

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
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  /** Projects / Estimates–aligned nav row */
  const navRowClass = (active: boolean) =>
    cn(
      "group relative flex items-center rounded-lg transition-all duration-150",
      collapsed
        ? "min-h-[44px] justify-center px-2 py-2.5 sm:min-h-0"
        : "min-h-[44px] gap-3 px-4 py-2.5 text-sm sm:min-h-0",
      active
        ? "bg-white font-semibold text-[#2D2D2D] shadow-sm dark:bg-card dark:text-foreground"
        : "font-medium text-[#2D2D2D] hover:bg-white hover:shadow-sm dark:text-foreground/90 dark:hover:bg-muted"
    );

  const navIconClass = (active: boolean, extra?: string) =>
    cn(
      "h-[18px] w-[18px] shrink-0 text-gray-500 transition-colors duration-150 group-hover:text-[#2D2D2D]",
      active && "text-[#2D2D2D]",
      extra
    );

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-[#EBEBE9] bg-[#F7F7F5] dark:border-border dark:bg-background",
        collapsed ? "w-[72px]" : "w-[240px]",
        className
      )}
    >
      <div
        className={cn(
          "flex h-12 items-center gap-2 border-b border-[#EBEBE9] dark:border-border",
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
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400">
              HH Unified
            </p>
            <p className="truncate text-sm font-semibold text-[#2D2D2D] dark:text-foreground">
              {orgName}
            </p>
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
            className={navRowClass(isActive("/dashboard"))}
          >
            <LayoutDashboard className={navIconClass(isActive("/dashboard"))} strokeWidth={1.75} />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </Link>
        </div>

        {/* Sections — collapsible groups, Estimates-style labels */}
        <div className={cn("flex flex-col", collapsed && "gap-1")}>
          {sections.map((section, sectionIndex) => {
            const isOpen = openSections[section.key] ?? false;
            if (collapsed) {
              return (
                <div
                  key={section.key}
                  className={cn("flex flex-col gap-1", sectionIndex > 0 && "mt-6")}
                >
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        title={item.label}
                        aria-label={item.label}
                        className={navRowClass(active)}
                      >
                        {Icon ? <Icon className={navIconClass(active)} strokeWidth={1.75} /> : null}
                      </Link>
                    );
                  })}
                </div>
              );
            }
            return (
              <div key={section.key} className={cn("flex flex-col", sectionIndex > 0 && "mt-6")}>
                <button
                  type="button"
                  onClick={() => setSectionOpen(section.key, !isOpen)}
                  className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 transition-all duration-150 hover:bg-white/70 hover:shadow-sm dark:text-muted-foreground dark:hover:bg-muted/60"
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
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="min-h-0 overflow-hidden">
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
                            className={navRowClass(active)}
                          >
                            {Icon ? (
                              <Icon className={navIconClass(active)} strokeWidth={1.75} />
                            ) : null}
                            {!collapsed && <span className="truncate">{item.label}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* System Health warning indicator */}
          {systemHealth.status === "warning" && (
            <div className="mt-6 flex flex-col gap-1">
              <Link
                href="/system-health"
                onClick={onNavigate}
                className={navRowClass(isActive("/system-health"))}
                title="System Health"
              >
                <AlertTriangle
                  className={navIconClass(
                    isActive("/system-health"),
                    "text-amber-500 group-hover:text-amber-600"
                  )}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {!collapsed && <span className="truncate">⚠ System Health</span>}
              </Link>
            </div>
          )}

          {/* Documents & Settings */}
          <div className="mt-6 flex flex-col gap-1">
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
                  className={navRowClass(active)}
                >
                  {Icon ? <Icon className={navIconClass(active)} strokeWidth={1.75} /> : null}
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User footer */}
      {!collapsed && (
        <div className="border-t border-[#EBEBE9] dark:border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#EBEBE9] bg-white dark:border-border dark:bg-card">
              <span className="text-[10px] font-semibold text-gray-500 dark:text-muted-foreground">
                U
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#2D2D2D] dark:text-foreground">
                User
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
                Admin
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Collapse button at bottom */}
      <div className="border-t border-[#EBEBE9] dark:border-border p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "flex w-full items-center rounded-lg text-sm font-medium text-gray-500 transition-all duration-150 hover:bg-white hover:text-[#2D2D2D] hover:shadow-sm dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground",
            collapsed ? "min-h-[44px] justify-center px-2 py-2 sm:min-h-8" : "gap-3 px-4 py-2.5"
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
