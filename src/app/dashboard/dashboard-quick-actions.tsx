import Link from "next/link";
import { FileText, FolderKanban, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UPLOAD_RECEIPT_ACTION } from "@/lib/navigation/actions";
import { cn } from "@/lib/utils";

const actions = [
  { label: "Create invoice", href: "/financial/invoices/new", icon: FileText, primary: true },
  { ...UPLOAD_RECEIPT_ACTION, icon: ReceiptText },
  { label: "Projects", href: "/projects", icon: FolderKanban, mobileHidden: true },
];

export function DashboardQuickActions({ className }: { className?: string }) {
  return (
    <div data-dashboard-primary-actions className={cn("flex min-w-0 flex-wrap gap-2", className)}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.href}
            asChild
            variant={action.primary ? "default" : "outline"}
            className={cn(
              "min-h-11 min-w-0 px-3 md:min-h-9",
              action.mobileHidden && "hidden sm:inline-flex"
            )}
          >
            <Link href={action.href}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{action.label}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
