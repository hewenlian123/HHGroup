import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expenseListQueryStaleMs, fetchWorkers, workersQueryKey } from "@/lib/queries/expenses";
import {
  fetchFinancialProjects,
  financialProjectsQueryKey,
  fetchReceiptQueue,
  receiptQueueQueryKey,
} from "@/lib/queries/receiptQueue";

const prefetchStale = expenseListQueryStaleMs;

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
  if (href === "/financial/receipt-queue" || href.startsWith("/financial/receipt-queue?")) {
    void prefetchReceiptQueuePageData(queryClient, supabase);
  }
}
