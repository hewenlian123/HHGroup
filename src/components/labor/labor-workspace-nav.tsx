"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  laborSections,
  laborPaymentSections,
  laborActiveSection,
  laborPaymentHref,
} from "@/lib/navigation/labor-workspace";

export function LaborWorkspaceNav({ pathname }: { pathname: string }) {
  const search = useSearchParams();
  const tab = search.get("tab");
  const active = laborActiveSection(pathname, tab);
  const mobile = ["Workers", "Time", "Payments"];
  const paymentContext = new URLSearchParams(search.toString());
  const balanceWorker = pathname.match(/^\/labor\/workers\/([^/]+)\/balance$/)?.[1];
  if (balanceWorker) paymentContext.set("workerId", decodeURIComponent(balanceWorker));
  const link = (item: { href: string; label: string }, selected: boolean) => (
    <Button
      asChild
      variant="ghost"
      className={`min-h-11 ${selected ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)] forced-colors:underline" : ""}`}
    >
      <Link href={item.href} prefetch={false} aria-current={selected ? "page" : undefined}>
        {item.label}
      </Link>
    </Button>
  );
  return (
    <div
      className="min-w-0 border-b border-[var(--hh-border-subtle)] bg-[var(--hh-surface-canvas)] px-3 py-2 print:hidden"
      data-workspace-navigation
    >
      <nav aria-label="Labor workspace" className="flex min-w-0 flex-wrap items-center gap-1">
        {laborSections.map((item) => (
          <span
            key={item.href}
            className={mobile.includes(item.label) ? "" : "hidden lg:inline-flex"}
          >
            {link(item, active === item.label)}
          </span>
        ))}
        <div className="lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`min-h-11 ${!mobile.includes(active) ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)] forced-colors:underline" : ""}`}
                aria-label="More Labor sections"
              >
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {laborSections
                .filter((item) => !mobile.includes(item.label))
                .map((item) => (
                  <DropdownMenuItem
                    key={item.href}
                    asChild
                    className={`min-h-11 ${active === item.label ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)] forced-colors:underline" : ""}`}
                  >
                    <Link
                      href={item.href}
                      prefetch={false}
                      aria-current={active === item.label ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
      {active === "Payments" && (
        <nav
          aria-label="Labor payment types"
          className="flex flex-wrap items-center gap-1 border-t border-[var(--hh-border-subtle)] pt-1"
        >
          {laborPaymentSections.map((item) => (
            <span key={item.href}>
              {link(
                { ...item, href: laborPaymentHref(item.href, paymentContext.toString()) },
                pathname === item.href ||
                  (pathname === "/reports/workforce" &&
                    tab === (item.label === "Balances" ? "balances" : item.label.toLowerCase()))
              )}
            </span>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="min-h-11">
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild className="min-h-11">
                <Link href="/labor/worker-invoices">Worker Invoices</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      )}
    </div>
  );
}
