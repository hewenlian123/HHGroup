"use client";

import "../expenses/expenses-ui-theme.css";
import * as React from "react";
import { ExpensesListSkeleton } from "@/components/financial/expenses-list-skeleton";
import { ExpensesPageClient } from "../expenses/expenses-client";

export default function InboxPage() {
  return (
    <React.Suspense
      fallback={
        <div className="expenses-ui bg-zinc-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background">
          <div className="expenses-ui-content mx-auto w-full max-w-[430px] px-3 py-4 sm:max-w-[460px] md:max-w-[1280px] md:px-8">
            <ExpensesListSkeleton rows={6} showStatCards />
          </div>
        </div>
      }
    >
      <ExpensesPageClient pool="inbox" />
    </React.Suspense>
  );
}
