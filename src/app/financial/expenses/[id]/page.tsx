import { notFound } from "next/navigation";
import { ExpenseDetailClient } from "./expense-detail-client";

type PageProps = {
  params: Promise<{ id?: string }>;
};

export default async function ExpenseDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();
  return <ExpenseDetailClient id={id} />;
}
