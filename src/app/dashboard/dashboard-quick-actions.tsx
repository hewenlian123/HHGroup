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
import { UPLOAD_RECEIPT_ACTION } from "@/lib/navigation/actions";
import { cn } from "@/lib/utils";

const actions = [
  { label: "Create invoice", href: "/financial/invoices/new", icon: FileText, primary: true },
  { ...UPLOAD_RECEIPT_ACTION, icon: ReceiptText },
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
        "dashboard-quick-actions grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end",
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
              "dashboard-action-button h-11 min-h-[44px] rounded-lg px-3 text-[12px] font-semibold tracking-normal",
              action.primary
                ? "border border-[rgb(184_147_90_/_0.42)] bg-[var(--hud-gold)] text-[#07090D] shadow-none hover:bg-[var(--hud-gold-soft)]"
                : "border-[var(--hud-line)] bg-[var(--hud-surface)] text-[var(--hud-text)] hover:border-[rgb(184_147_90_/_0.3)] hover:bg-[var(--hud-surface-muted)]"
            )}
          >
            <Link href={action.href}>
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{action.label}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
