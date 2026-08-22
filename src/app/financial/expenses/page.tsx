"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import { ExpensesListSkeleton } from "@/components/financial/expenses-list-skeleton";
import { ExpensesPageClient } from "./expenses-client";

export default function ExpensesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="expenses-ui pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))]">
          <div className="expenses-ui-content page-shell-wide mx-auto w-full max-w-[430px] px-3 py-4 sm:max-w-[460px] md:px-8">
            <ExpensesListSkeleton rows={6} showStatCards mode="ledger" />
          </div>
        </div>
      }
    >
      <ExpensesPageClient pool="expenses" />
    </React.Suspense>
  );
}
