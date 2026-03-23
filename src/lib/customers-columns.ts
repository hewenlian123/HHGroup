/**
 * Select list for `public.customers` (see migrations/202602280003_create_customers_table.sql).
 * Kept out of `customers-db.ts` because that file is `"use server"` and may only export async functions.
 */
export const CUSTOMERS_DB_COLUMNS =
  "id,name,email,phone,address,notes,created_at,updated_at,contact_person,status" as const;
