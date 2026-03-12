"use server";

import { insertLaborPayment } from "@/lib/data";

export async function recordPaymentAction(payload: {
  worker_id: string;
  payment_date: string;
  amount: number;
  method: string;
  note?: string | null;
}) {
  await insertLaborPayment(payload);
}
