import { financeReturnPath } from "@/lib/finance-navigation";
import { notFound } from "next/navigation";
import { ExpenseDetailClient } from "./expense-detail-client";

type PageProps = {
  params: Promise<{ id?: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function ExpenseDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  if (!id) notFound();
  const returnHref = financeReturnPath(returnTo, "/financial/expenses");
  return <ExpenseDetailClient id={id} returnHref={returnHref} />;
}
