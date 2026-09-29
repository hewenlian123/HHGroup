import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getInvoicesWithDerived,
  getProjects,
  type InvoiceWithDerived,
  type Project,
} from "@/lib/data";

/**
 * Default invoice list payload: every derived invoice plus projects.
 * Matches `GET /api/invoices?derived=1&all=1&includeProjects=1` with no status, project, or search filter.
 */
export async function loadDefaultInvoiceList(client: SupabaseClient): Promise<{
  invoices: InvoiceWithDerived[];
  projects: Project[];
}> {
  const [invoices, projects] = await Promise.all([
    getInvoicesWithDerived(undefined, client),
    getProjects(client),
  ]);
  return { invoices, projects };
}
