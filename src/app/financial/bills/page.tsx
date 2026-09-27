import { redirect } from "next/navigation";
import { financeWorkspacePath } from "@/lib/finance-navigation";

export const dynamic = "force-dynamic";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(financeWorkspacePath("/bills", await searchParams));
}
