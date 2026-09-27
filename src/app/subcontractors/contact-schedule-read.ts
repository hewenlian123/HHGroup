import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentScheduleBySubcontractIds } from "@/lib/subcontract-payment-schedule-db";

/** Keep the legacy reader's mapping; Contacts must distinguish absent schema from empty schedules. */
export async function getContactPaymentSchedule(ids: string[], client?: SupabaseClient) {
  if (ids.length === 0) return [];
  if (!client) throw new Error("Subcontractor schedule unavailable.");
  const { error } = await client
    .from("subcontract_payment_schedule")
    .select(
      "id,subcontract_id,project_id,subcontractor_id,title,description,amount,due_date,status,ap_bill_id,created_at,updated_at"
    )
    .limit(0);
  if (error) throw new Error(error.message);
  return getPaymentScheduleBySubcontractIds(ids, client);
}
