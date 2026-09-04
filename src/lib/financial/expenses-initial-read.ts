import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getExpenseCategories,
  getExpenses,
  getPaymentAccounts,
  getProjects,
  getSubcontractDeductionOptions,
  getWorkers,
} from "@/lib/data";
import { defaultExpenseListSort } from "@/lib/expenses-db";
import type { ExpensesInitialData } from "@/lib/queries/expenses";

export async function loadExpensesInitialData(
  client: SupabaseClient
): Promise<ExpensesInitialData> {
  const [expenses, categories, workers, subcontractDeductionOptions, projects, paymentAccounts] =
    await Promise.all([
      getExpenses(defaultExpenseListSort, { includeLinkedBankTx: false }, client),
      getExpenseCategories(false, client),
      getWorkers(client),
      getSubcontractDeductionOptions(client),
      getProjects(client),
      getPaymentAccounts(client),
    ]);

  return {
    sort: defaultExpenseListSort,
    expenses,
    categories,
    workers: workers.map((worker) => ({ id: worker.id, name: worker.name })),
    subcontractDeductionOptions,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
    })),
    paymentAccounts,
  };
}
