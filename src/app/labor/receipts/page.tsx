import { redirect } from "next/navigation";

import {
  type ExpenseOperationsSearchParams,
  workerReceiptInboxPath,
} from "@/lib/expense-operations-routing";

type Props = { searchParams: Promise<ExpenseOperationsSearchParams> };

/**
 * Compatibility route for saved Worker Receipts links.
 * Canonical review now lives inside Receipt Inbox; persistence and handlers remain unchanged.
 */
export default async function LaborReceiptsCompatibilityPage({ searchParams }: Props) {
  redirect(workerReceiptInboxPath(await searchParams));
}
