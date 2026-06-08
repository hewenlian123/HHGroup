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
      className="dark"
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
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-[var(--neo-text-secondary)] transition-colors hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)]"
        >
          Owner dashboard
        </Link>
        <Link
          href="/financial/accounts"
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-[var(--neo-text-secondary)] transition-colors hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)]"
        >
          Accounts
        </Link>
        <Link
          href="/financial/dashboard"
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-[var(--neo-text-secondary)] transition-colors hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)]"
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
                "group rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] p-4 text-[var(--neo-text-primary)]",
                "transition-[border-color,background-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-[rgb(184_137_45_/_0.32)] hover:bg-[rgb(184_137_45_/_0.08)]"
              )}
            >
              <div className="flex items-start gap-3">
                <span className={OS.iconWell}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--neo-text-primary)]">{title}</h3>
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
