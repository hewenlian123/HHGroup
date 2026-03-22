import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id?: string }> };

export default async function BillDetailRedirectPage({ params }: Props) {
  const { id } = await params;
  const billId = typeof id === "string" ? id : "";
  redirect(billId ? `/bills/${billId}` : "/bills");
}
