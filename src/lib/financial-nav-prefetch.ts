import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildExpensesQueryKey,
  defaultExpenseListSort,
  expenseCategoriesQueryKey,
  fetchExpenseCategories,
  fetchExpenses,
  fetchWorkers,
  workersQueryKey,
} from "@/lib/queries/expenses";
import {
  fetchFinancialProjects,
  fetchReceiptQueue,
  financialProjectsQueryKey,
  receiptQueueQueryKey,
} from "@/lib/queries/receiptQueue";

const prefetchStale = 30_000;

export function prefetchExpensesPageData(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.prefetchQuery({
      queryKey: buildExpensesQueryKey(defaultExpenseListSort),
      queryFn: () => fetchExpenses(defaultExpenseListSort),
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
  ]).then(() => undefined);
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
      queryKey: buildExpensesQueryKey(defaultExpenseListSort),
      queryFn: () => fetchExpenses(defaultExpenseListSort),
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
    void prefetchExpensesPageData(queryClient);
    return;
  }
  if (href === "/financial/receipt-queue" || href.startsWith("/financial/receipt-queue?")) {
    void prefetchReceiptQueuePageData(queryClient, supabase);
  }
}
