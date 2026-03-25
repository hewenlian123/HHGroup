/**
 * Select list for `public.customers`.
 * Omit `updated_at`: older DBs created from `202604171000_customers.sql` do not have that column.
 * Kept out of `customers-db.ts` because that file is `"use server"` and may only export async functions.
 */
export const CUSTOMERS_DB_COLUMNS =
  "id,name,email,phone,address,notes,created_at,contact_person,status" as const;
