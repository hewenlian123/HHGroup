import Link from "next/link";
import {
  ArrowLeftRight,
  CircleDollarSign,
  FileText,
  FolderKanban,
  HandCoins,
  ReceiptText,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const actions = [
  { label: "Create invoice", href: "/financial/invoices/new", icon: FileText, primary: true },
  { label: "Review receipts", href: "/financial/inbox", icon: ReceiptText },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Pay Worker", href: "/workers", icon: UsersRound },
  {
    label: "Workers Ready To Pay",
    href: "/reports/workforce?tab=payroll",
    icon: CircleDollarSign,
  },
  { label: "Payroll Due", href: "/reports/workforce?tab=payroll", icon: WalletCards },
  { label: "Outstanding Advances", href: "/reports/workforce?tab=advances", icon: HandCoins },
  {
    label: "Pending Reimbursements",
    href: "/reports/workforce?tab=reimbursements",
    icon: ReceiptText,
  },
  { label: "Labor", href: "/labor", icon: ArrowLeftRight },
];

export function DashboardQuickActions({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "dashboard-quick-actions grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
        className
      )}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.href}
            asChild
            variant={action.primary ? "default" : "outline"}
            className={cn(
              "dashboard-action-button h-11 min-h-[44px] min-w-0 whitespace-normal rounded-lg px-3 text-[13px] font-semibold leading-tight tracking-normal",
              action.primary
                ? "border border-[rgb(184_147_90_/_0.42)] bg-[var(--hud-gold)] text-[#07090D] shadow-none hover:bg-[var(--hud-gold-soft)]"
                : "border-[var(--hud-line)] bg-[var(--hud-surface)] text-[var(--hud-text)] hover:border-[rgb(184_147_90_/_0.3)] hover:bg-[var(--hud-surface-muted)]"
            )}
          >
            <Link href={action.href}>
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 text-wrap">{action.label}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
