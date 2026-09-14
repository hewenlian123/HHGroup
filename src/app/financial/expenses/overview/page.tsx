import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function ExpensesOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  redirect(`${values.ops_record ? "/financial/expenses" : "/financial/inbox"}${query.size ? `?${query}` : ""}`);
}
