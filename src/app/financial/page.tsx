import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Financial"
        description="Choose a finance workspace."
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-sm">
            <Link href="/finance">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Finance
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 pb-3 text-sm text-muted-foreground">
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

      <section>
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
          Finance overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {financeLinks.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-md border border-slate-900/[0.06] bg-white/[0.92] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-px hover:border-slate-900/[0.1] hover:shadow-[0_8px_32px_rgba(15,23,42,0.07)] dark:border-border/60 dark:bg-card/90"
            >
              <div className="flex items-start gap-3">
                <span className="rounded-md border border-slate-900/[0.06] bg-slate-50/75 p-2 text-zinc-500 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-400">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-950 group-hover:text-foreground dark:text-zinc-50">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
