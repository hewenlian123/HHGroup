import Link from "next/link";
import { FilterToolbar, NeoPanel, PageHeader, PageLayout } from "@/components/base";
import { Button } from "@/components/ui/button";
import { OS, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Banknote,
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  Landmark,
  Receipt,
  WalletCards,
} from "lucide-react";

export const dynamic = "force-dynamic";

const financeLinks = [
  {
    href: "/financial/owner",
    title: "Owner dashboard",
    description: "Executive finance snapshot and cash-flow trends.",
    icon: Building2,
  },
  {
    href: "/financial/accounts",
    title: "Accounts",
    description: "Payment accounts and cash controls.",
    icon: Landmark,
  },
  {
    href: "/financial/invoices",
    title: "Invoices",
    description: "Create, track, and manage customer invoices.",
    icon: FileText,
  },
  {
    href: "/estimate-templates",
    title: "Estimate Templates",
    description: "Reusable proposal scopes for repeated estimate types.",
    icon: FileText,
  },
  {
    href: "/financial/payments",
    title: "Payments Received",
    description: "Record incoming customer payments.",
    icon: CreditCard,
  },
  {
    href: "/financial/deposits",
    title: "Deposits",
    description: "Review deposits created from received payments.",
    icon: Banknote,
  },
  {
    href: "/bills",
    title: "Bills",
    description: "Track AP bills and vendor obligations.",
    icon: Receipt,
  },
  {
    href: "/financial/expenses",
    title: "Expenses",
    description: "Manage company expenses and receipt workflows.",
    icon: WalletCards,
  },
  {
    href: "/reports",
    title: "Reports",
    description: "Operating analysis, profitability, AR aging, and AP aging.",
    icon: BarChart3,
  },
] as const;

export default function FinancialPage() {
  return (
    <PageLayout
      header={
        <PageHeader
          title="Financial"
          description="Choose a finance workspace."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/finance">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Finance
              </Link>
            </Button>
          }
        />
      }
    >
      <FilterToolbar className="items-start gap-2 md:flex-wrap md:items-center">
        <Link
          href="/financial/owner"
          className={cn(
            "flex min-h-hh-touch items-center rounded-hh-compact px-2.5 py-1.5 text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l2-operational-surface)] hover:text-[var(--hh-text-primary)] sm:min-h-hh-control-compact",
            TYPO.button
          )}
        >
          Owner dashboard
        </Link>
        <Link
          href="/financial/accounts"
          className={cn(
            "flex min-h-hh-touch items-center rounded-hh-compact px-2.5 py-1.5 text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l2-operational-surface)] hover:text-[var(--hh-text-primary)] sm:min-h-hh-control-compact",
            TYPO.button
          )}
        >
          Accounts
        </Link>
        <Link
          href="/financial/dashboard"
          className={cn(
            "flex min-h-hh-touch items-center rounded-hh-compact px-2.5 py-1.5 text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l2-operational-surface)] hover:text-[var(--hh-text-primary)] sm:min-h-hh-control-compact",
            TYPO.button
          )}
        >
          Company Dashboard
        </Link>
      </FilterToolbar>

      <NeoPanel
        eyebrow="Finance overview"
        title="Financial workspaces"
        description="Move between cash controls, invoices, payments, deposits, bills, and receipt workflows."
        bodyClassName="p-3"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {financeLinks.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "group rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-4 text-[var(--hh-text-primary)]",
                "transition-[border-color,background-color] duration-150 ease-out hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)]"
              )}
            >
              <div className="flex items-start gap-3">
                <span className={OS.iconWell}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--hh-text-primary)]">{title}</h3>
                  <p className={cn("mt-1", TYPO.mutedText)}>{description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </NeoPanel>
    </PageLayout>
  );
}
