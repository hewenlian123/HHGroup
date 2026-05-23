import Link from "next/link";
import { Divider, PageHeader, PageLayout } from "@/components/base";
import { Button } from "@/components/ui/button";
import { OS, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Banknote,
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--neo-text-secondary)]">
        <Link href="/financial/owner" className="hover:text-foreground">
          Owner dashboard
        </Link>
        <Link href="/financial/accounts" className="hover:text-foreground">
          Accounts
        </Link>
        <Link href="/financial/dashboard" className="hover:text-foreground">
          Company Dashboard
        </Link>
      </div>
      <Divider />

      <section>
        <h2 className={cn("mb-4", TYPO.sectionLabel)}>Finance overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {financeLinks.map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href} className={cn("group p-4", OS.card, OS.cardHover)}>
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
      </section>
    </PageLayout>
  );
}
