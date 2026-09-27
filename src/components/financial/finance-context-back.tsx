"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { financeReturnPath, financeReturnLabel } from "@/lib/finance-navigation";

export function FinanceContextBack() {
  const params = useSearchParams();
  const href = financeReturnPath(params.get("returnTo"), "");
  if (!href) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>{financeReturnLabel(href)}</Link>
    </Button>
  );
}
