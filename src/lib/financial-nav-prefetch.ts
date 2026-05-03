import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readStoredExpenseSort } from "@/lib/expense-list-sort-storage";
import {
  buildExpensesQueryKey,
  expenseCategoriesQueryKey,
  expenseListQueryStaleMs,
  fetchExpenseCategories,
  fetchExpenses,
  fetchWorkers,
  workersQueryKey,
} from "@/lib/queries/expenses";
import {
  fetchFinancialProjects,
  financialProjectsQueryKey,
  fetchReceiptQueue,
  receiptQueueQueryKey,
} from "@/lib/queries/receiptQueue";

const prefetchStale = expenseListQueryStaleMs;

export function prefetchExpensesPageData(
  queryClient: QueryClient,
  supabase: SupabaseClient | null
): Promise<void> {
  const sort = readStoredExpenseSort();
  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery({
      queryKey: buildExpensesQueryKey(sort),
      queryFn: () => fetchExpenses(sort),
      staleTime: prefetchStale,
    }),
    queryClient.prefetchQuery({
      queryKey: expenseCategoriesQueryKey,
      queryFn: fetchExpenseCategories,
      staleTime: prefetchStale,
    }),
    queryClient.prefetchQuery({
      queryKey: workersQueryKey,
      queryFn: fetchWorkers,
      staleTime: prefetchStale,
    }),
  ];
  if (supabase) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: financialProjectsQueryKey,
        queryFn: () => fetchFinancialProjects(supabase),
        staleTime: prefetchStale,
      })
    );
  }
  return Promise.all(tasks).then(() => undefined);
}

export function prefetchReceiptQueuePageData(
  queryClient: QueryClient,
  supabase: SupabaseClient | null
): Promise<void> {
  if (!supabase) return Promise.resolve();
  return Promise.all([
    queryClient.prefetchQuery({
      queryKey: receiptQueueQueryKey,
      queryFn: () => fetchReceiptQueue(supabase),
      staleTime: prefetchStale,
    }),
    queryClient.prefetchQuery({
      queryKey: workersQueryKey,
      queryFn: fetchWorkers,
      staleTime: prefetchStale,
    }),
    queryClient.prefetchQuery({
      queryKey: financialProjectsQueryKey,
      queryFn: () => fetchFinancialProjects(supabase),
      staleTime: prefetchStale,
    }),
  ]).then(() => undefined);
}

export function prefetchFinancialRoute(
  queryClient: QueryClient,
  supabase: SupabaseClient | null,
  href: string
): void {
  if (
    href === "/financial/expenses" ||
    href.startsWith("/financial/expenses?") ||
    href === "/financial/inbox" ||
    href.startsWith("/financial/inbox?")
  ) {
    void prefetchExpensesPageData(queryClient, supabase);
    return;
  }
  if (href === "/financial/receipt-queue" || href.startsWith("/financial/receipt-queue?")) {
    void prefetchReceiptQueuePageData(queryClient, supabase);
  }
}
