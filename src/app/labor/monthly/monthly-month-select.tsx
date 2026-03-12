"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function MonthlyLaborMonthSelect({ value }: { value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const month = e.target.value;
    if (!month) return;
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.set("month", month);
    router.push(`/labor/monthly?${next.toString()}`);
  };

  return (
    <Input
      type="month"
      value={value}
      onChange={handleChange}
      className="h-9 w-[160px] text-sm tabular-nums"
    />
  );
}
