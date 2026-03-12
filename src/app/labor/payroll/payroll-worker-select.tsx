"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Worker = { id: string; name: string };

export function PayrollWorkerSelect({
  workers,
  selectedWorkerId,
}: {
  workers: Worker[];
  selectedWorkerId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (id) next.set("workerId", id);
    else next.delete("workerId");
    router.push(`/labor/payroll?${next.toString()}`);
  };

  return (
    <select
      value={selectedWorkerId}
      onChange={handleChange}
      className="h-9 min-w-[220px] rounded-md border border-input bg-transparent px-3 text-sm"
    >
      <option value="">Select worker</option>
      {workers.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}
