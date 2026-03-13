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
  Users,
  FileStack,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDollarSign,
  Landmark,
  CheckSquare,
  ListChecks,
  Calendar,
  Camera,
  ClipboardCheck,
  Boxes,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyInitials, getCompanyProfile } from "@/lib/company-profile";

const STORAGE_KEY = "hh.sidebarSections";

type NavItem = { href: string; label: string; icon?: React.ComponentType<{ className?: string }> };

/** Section key for localStorage; must be stable. */
const SECTION_KEYS = ["PROJECTS", "WORK_MANAGEMENT", "FINANCE", "LABOR", "RESOURCES"] as const;

const sections: { key: (typeof SECTION_KEYS)[number]; label: string; items: NavItem[] }[] = [
  {
    key: "PROJECTS",
    label: "PROJECTS",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/estimates", label: "Estimates", icon: FileText },
      { href: "/schedule", label: "Schedule", icon: Calendar },
    ],
  },
  {
    key: "WORK_MANAGEMENT",
    label: "WORK MANAGEMENT",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/punch-list", label: "Punch List", icon: ListChecks },
      { href: "/site-photos", label: "Site Photos", icon: Camera },
      { href: "/inspection-log", label: "Inspection Log", icon: ClipboardCheck },
    ],
  },
  {
    key: "FINANCE",
    label: "FINANCE",
    items: [
      { href: "/financial/invoices", label: "Invoices", icon: Receipt },
      { href: "/financial/payments", label: "Payments Received", icon: CircleDollarSign },
      { href: "/financial/deposits", label: "Deposits", icon: Landmark },
      { href: "/bills", label: "Bills", icon: Banknote },
      { href: "/financial/expenses", label: "Expenses", icon: ShoppingCart },
      { href: "/financial/commissions", label: "Commission Payments", icon: Percent },
      { href: "/financial/accounts", label: "Accounts", icon: CreditCard },
    ],
  },
  {
    key: "LABOR",
    label: "LABOR",
    items: [
      { href: "/labor", label: "Daily Entry", icon: Clock },
      { href: "/workers", label: "Workers", icon: Users },
    ],
  },
  {
    key: "RESOURCES",
    label: "RESOURCES",
    items: [{ href: "/materials/catalog", label: "Material Catalog", icon: Boxes }],
  },
];

const standaloneItems: NavItem[] = [
  { href: "/documents", label: "Documents", icon: FileStack },
  { href: "/settings", label: "Settings", icon: Settings },
];

function readStoredOpen(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredOpen(state: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function getDefaultOpen(): Record<string, boolean> {
  return SECTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: true }), {} as Record<string, boolean>);
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
  const [orgName, setOrgName] = React.useState("HH Group");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);

  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => ({}));
  const sectionsInitDone = React.useRef(false);

  React.useEffect(() => {
    if (sectionsInitDone.current) return;
    sectionsInitDone.current = true;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobileOrTablet) {
      const allClosed = SECTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: false }), {});
      setOpenSections(allClosed);
      return;
    }
    const stored = readStoredOpen();
    if (Object.keys(stored).length > 0) {
      setOpenSections((prev) => ({ ...prev, ...stored }));
    } else {
      setOpenSections(SECTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: true }), {}));
    }
  }, []);

  const setSectionOpen = React.useCallback((key: string, open: boolean) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: open };
      if (typeof window !== "undefined" && window.innerWidth >= 1024) {
        writeStoredOpen(next);
      }
      return next;
    });
  }, []);

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
          {sections.map((section) => {
            const isOpen = openSections[section.key] ?? false;
            if (collapsed) {
              return (
                <div key={section.key} className="flex flex-col gap-1">
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
                        className={linkClass(active)}
                      >
                        {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : null}
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              );
            }
            return (
              <div key={section.key} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => setSectionOpen(section.key, !isOpen)}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-400 transition-colors hover:bg-gray-50 hover:text-[#111111]"
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{section.label}</span>
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="flex flex-col gap-1 pb-1">
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
                            className={linkClass(active)}
                          >
                            {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : null}
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

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
