"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, PanelLeft, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyInitials, getCompanyProfile } from "@/lib/company-profile";
import { cn } from "@/lib/utils";

export function Topbar({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const [orgName, setOrgName] = React.useState("HH Group");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const pathname = usePathname();

  const crumbs = React.useMemo(() => {
    const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
    if (parts.length === 0) return ["Dashboard"];
    return parts.map((p) => p.replace(/-/g, " ")).map((p) => p.slice(0, 1).toUpperCase() + p.slice(1));
  }, [pathname]);

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
        // Keep fallback header branding.
      }
    };
    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-[#E5E7EB] bg-white px-4 md:px-5">
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 min-h-[44px] min-w-[44px] shrink-0 md:hidden"
          aria-label="Open navigation"
          onClick={onOpenSidebar}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-1">
          <span className="truncate text-base font-semibold text-[#111111] md:hidden">
            {crumbs.length > 0 ? crumbs[crumbs.length - 1] : "Dashboard"}
          </span>
          <nav className="hidden min-w-0 items-center gap-1 text-sm text-[#6B7280] md:flex" aria-label="Breadcrumb">
            <span className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-400">{orgName}</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
            <div className="flex min-w-0 items-center gap-1">
              {crumbs.slice(0, 3).map((c, i) => (
                <React.Fragment key={`${c}-${i}`}>
                  {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />}
                  <span className={cn("truncate", i === crumbs.length - 1 ? "text-[#111111]" : undefined)}>{c}</span>
                </React.Fragment>
              ))}
            </div>
          </nav>
        </div>
        <button
          type="button"
          className="ml-1 hidden w-[380px] max-w-[36vw] items-center gap-2 rounded-lg border border-[#E5E7EB] bg-[#F7F7F8] px-3 py-2 text-sm text-[#6B7280] hover:bg-gray-50 lg:flex"
          aria-label="Search (Command Palette)"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Search or jump to…</span>
          <span className="ml-auto rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[11px] text-[#6B7280]">
            ⌘K
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 min-h-[44px] min-w-[44px] shrink-0 lg:hidden"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="hidden h-10 min-h-[44px] rounded-lg px-4 sm:flex" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/projects">New Project</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/estimates">New Estimate</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/financial/invoices">New Invoice</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/financial/expenses">New Expense</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 min-h-[44px] min-w-[44px] rounded-full"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 min-h-[44px] min-w-[44px] rounded-full">
              <Avatar className="h-9 w-9">
                {logoUrl ? <AvatarImage src={logoUrl} alt={orgName} className="object-contain" /> : null}
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {getCompanyInitials(orgName)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
