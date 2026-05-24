import Link from "next/link";
import { FileText, FolderKanban, ReceiptText, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const actions = [
  { label: "Create invoice", href: "/financial/invoices/new", icon: FileText, primary: true },
  { label: "Review receipts", href: "/financial/inbox", icon: ReceiptText },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Labor", href: "/labor", icon: UsersRound },
];

export function DashboardQuickActions({ className }: { className?: string }) {
  return (
    <div className={cn("dashboard-quick-actions grid grid-cols-2 gap-2 sm:flex", className)}>
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
