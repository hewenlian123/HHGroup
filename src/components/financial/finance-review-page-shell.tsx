"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { WorkspaceNavigation } from "@/components/layout/workspace-navigation";
import { ExpenseOperationsWorkspaceNav } from "./expense-operations-workspace-nav";
import { ReceiptInboxSourceNav } from "./receipt-inbox-source-nav";
import "./finance-review-page-shell.css";

/** Both receipt workflows share geometry; clients retain all data and actions. */
export function FinanceReviewPageShell({
  title,
  description,
  actions,
  status,
  commandBar,
  children,
}: {
  title: string;
  description: string;
  actions: ReactNode;
  status: ReactNode;
  commandBar: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navigationSlot, setNavigationSlot] = useState<Element | null>(null);
  useEffect(() => {
    setNavigationSlot(document.querySelector("[data-app-shell-workspace-slot]"));
  }, []);
  const ownsFinanceNavigation =
    pathname === "/financial/inbox" || pathname === "/financial/inbox/worker";

  return (
    <>
      {ownsFinanceNavigation &&
        navigationSlot &&
        createPortal(<WorkspaceNavigation pathname={pathname} />, navigationSlot)}
      <div
        className="expenses-ui-content expenses-page-shell finance-review-page-shell"
        data-finance-review-shell
      >
        <ExpenseOperationsWorkspaceNav showHeader={false} />
        <header className="finance-review-header" data-review-region="header">
          <div className="min-w-0">
            <h1 className="text-hh-page-title tracking-normal text-[var(--hh-text-primary)]">
              {title}
            </h1>
            <p className="text-sm text-[var(--hh-text-secondary)]">{description}</p>
          </div>
          <div className="finance-review-header-actions">{actions}</div>
        </header>
        {pathname === "/financial/inbox/worker" && <div data-review-region="sources">
          <ReceiptInboxSourceNav />
        </div>}
        <div className="finance-review-status" data-review-region="status">
          {status}
        </div>
        <div className="finance-review-command" data-review-region="command">
          {commandBar}
        </div>
        <div className="finance-review-workspace" data-review-region="workspace">
          {children}
        </div>
      </div>
    </>
  );
}
