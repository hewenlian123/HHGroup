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
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200/60 bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6 dark:border-border">
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.08),transparent)]"
        aria-hidden
      />
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <nav className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex" aria-label="Breadcrumb">
          <span className="truncate text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{orgName}</span>
          <ChevronRight className="h-4 w-4 opacity-50" />
          <div className="flex min-w-0 items-center gap-1">
            {crumbs.slice(0, 3).map((c, i) => (
              <React.Fragment key={`${c}-${i}`}>
                {i > 0 && <ChevronRight className="h-4 w-4 opacity-40" />}
                <span className={cn("truncate", i === crumbs.length - 1 ? "text-foreground" : undefined)}>{c}</span>
              </React.Fragment>
            ))}
          </div>
        </nav>
        <button
          type="button"
          className="ml-1 hidden w-[420px] max-w-[36vw] items-center gap-2 rounded-md border border-zinc-200/70 bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-zinc-50 dark:border-border dark:hover:bg-muted/30 md:flex"
          aria-label="Search (Command Palette)"
        >
          <Search className="h-4 w-4" />
          <span className="truncate">Search or jump to…</span>
          <span className="ml-auto rounded border border-zinc-200/70 bg-zinc-50 px-1.5 py-0.5 text-[11px] text-muted-foreground dark:border-border dark:bg-muted/30">
            ⌘K
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-9 rounded-md px-3" size="sm">
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
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
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
