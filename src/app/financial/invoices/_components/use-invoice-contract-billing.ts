"use client";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import {
  assembleInvoiceContractBilling,
  type InvoiceExTaxSource,
} from "@/lib/financial/remaining-contract";
import { roundMoney } from "@/lib/money";

export type InvoiceBillingHistoryRow = {
  id: string;
  invoiceNo: string;
  status: string;
  issueDate: string;
  total: number;
};

export type InvoiceContractBilling =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unavailable" }
  | {
      status: "ready";
      originalContract: number;
      approvedChangeOrders: number;
      previouslyInvoicedExcludingTax: number;
      history: InvoiceBillingHistoryRow[];
    };

type InvoiceHistoryRow = InvoiceExTaxSource & {
  invoice_no?: string | null;
  issue_date?: string | null;
};

function isClosedHistoryStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "void" ||
    normalized === "voided" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  );
}

export function useInvoiceContractBilling(
  supabase: SupabaseClient | null,
  projectId: string,
  excludeInvoiceId?: string | null
): InvoiceContractBilling {
  const [state, setState] = React.useState<InvoiceContractBilling>({ status: "idle" });
  const [refreshKey, setRefreshKey] = React.useState(0);

  const refreshBilling = React.useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);
  useOnAppSync(refreshBilling, [refreshBilling]);

  React.useEffect(() => {
    if (!projectId) {
      setState({ status: "idle" });
      return;
    }
    if (!supabase) {
      setState({ status: "unavailable" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      const [projectRes, changeOrderRes, invoiceRes] = await Promise.all([
        supabase.from("projects").select("budget").eq("id", projectId).maybeSingle(),
        supabase
          .from("project_change_orders")
          .select("total,total_amount")
          .eq("project_id", projectId)
          .eq("status", "Approved"),
        supabase
          .from("invoices")
          .select("id,invoice_no,status,issue_date,subtotal,tax_amount,total")
          .eq("project_id", projectId)
          .order("issue_date", { ascending: false }),
      ]);

      if (cancelled) return;
      if (projectRes.error || changeOrderRes.error || invoiceRes.error || !projectRes.data) {
        setState({ status: "unavailable" });
        return;
      }

      const invoices = (invoiceRes.data ?? []) as InvoiceHistoryRow[];
      const assembled = assembleInvoiceContractBilling({
        originalContract: (projectRes.data as { budget?: unknown }).budget,
        approvedChangeOrders: (changeOrderRes.data ?? []) as Array<{
          total?: unknown;
          total_amount?: unknown;
        }>,
        invoices,
        excludeInvoiceId,
      });

      const history: InvoiceBillingHistoryRow[] = [];
      for (const row of invoices) {
        const id = row.id?.trim();
        if (!id) continue;
        const status = (row.status ?? "").trim();
        if (isClosedHistoryStatus(status)) continue;
        history.push({
          id,
          invoiceNo: row.invoice_no?.trim() || "Invoice",
          status: status || "Invoice",
          issueDate: (row.issue_date ?? "").slice(0, 10),
          total: roundMoney(row.total),
        });
      }

      setState({
        status: "ready",
        ...assembled,
        history,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [excludeInvoiceId, projectId, refreshKey, supabase]);

  return state;
}
