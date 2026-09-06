"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const billing = [
  ["Overview", "/financial/ar"],
  ["Invoices", "/financial/invoices"],
  ["Payments", "/financial/payments"],
] as const;
const payables = [
  ["Overview", "/financial/payables"],
  ["Bills", "/bills"],
  ["Payments", "/financial/payables/payments"],
] as const;

const accounts = [
  ["Overview", "/financial/accounts/overview"],
  ["Accounts", "/financial/accounts"],
  ["Transactions", "/financial/bank"],
  ["Deposits", "/financial/deposits"],
] as const;

export function FinanceSectionNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  if (/\/(print|preview)(\/|$)/.test(pathname)) return null;
  const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const isBilling = billing.some(([, path]) => matches(path));
  const isPayables = matches("/bills") || matches("/financial/payables");
  const isAccounts = accounts.some(([, path]) => matches(path));
  if (!isBilling && !isPayables && !isAccounts) return null;
  const items = isBilling ? billing : isPayables ? payables : accounts;
  const active = [...items]
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, path]) => matches(path))?.[1];
  const customerId = isBilling ? params.get("customerId") : null;
  return (
    <div className="page-container min-w-0 py-2 print:hidden" data-finance-section>
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--hh-border)] pb-2">
        <span className="text-hh-control font-semibold text-[var(--hh-text-primary)]">
          {isBilling
            ? "Billing · Money In"
            : isPayables
              ? "Payables · Money Out"
              : "Accounts · Cash movement"}
        </span>
        <nav
          aria-label={
            isBilling ? "Billing sections" : isPayables ? "Payables sections" : "Accounts sections"
          }
          className="flex min-w-0 max-w-full gap-1 overflow-x-auto"
        >
          {items.map(([label, path]) => (
            <Button
              key={path}
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "shrink-0",
                active === path && "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
              )}
            >
              <Link
                href={customerId ? `${path}?${new URLSearchParams({ customerId })}` : path}
                prefetch={false}
                aria-current={active === path ? "page" : undefined}
              >
                {label}
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </div>
  );
}
