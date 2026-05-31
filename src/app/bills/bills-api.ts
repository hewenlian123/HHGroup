import "server-only";

import { headers } from "next/headers";
import type { ApBillPaymentRow, ApBillWithProject } from "@/lib/ap-bills-db";

type BillsSummary = {
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  dueThisWeekCount: number;
  dueThisWeekAmount: number;
  paidThisMonthAmount: number;
};

export type BillsApiProjectOption = { id: string; name: string };

export type BillsPageData = {
  available: boolean;
  message: string | null;
  bills: ApBillWithProject[];
  summary: BillsSummary;
  projects: BillsApiProjectOption[];
};

export type BillDetailData = {
  bill: ApBillWithProject;
  payments: ApBillPaymentRow[];
};

const ZERO_SUMMARY: BillsSummary = {
  totalOutstanding: 0,
  overdueCount: 0,
  overdueAmount: 0,
  dueThisWeekCount: 0,
  dueThisWeekAmount: 0,
  paidThisMonthAmount: 0,
};

async function requestBaseUrl(): Promise<{ origin: string; cookie: string | null }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("Unable to resolve app host for Bills API.");
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return { origin: `${proto}://${host}`, cookie: h.get("cookie") };
}

async function apiJson(
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: unknown }> {
  const { origin, cookie } = await requestBaseUrl();
  const headersInit = new Headers(init?.headers);
  headersInit.set("Accept", "application/json");
  if (cookie) headersInit.set("Cookie", cookie);
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: headersInit,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function messageFromBody(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    typeof (body as { message?: unknown }).message === "string"
    ? (body as { message: string }).message
    : fallback;
}

export async function fetchBillsPageData(searchParams: {
  search?: string;
  status?: string;
  bill_type?: string;
  project_id?: string;
  date_from?: string;
  date_to?: string;
  overdue_only?: string;
}): Promise<BillsPageData> {
  const query = new URLSearchParams();
  query.set("includeProjects", "1");
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && value.trim()) query.set(key, value);
  }

  const { status, body } = await apiJson(`/api/bills?${query.toString()}`);
  if (status >= 400) {
    return {
      available: false,
      message: messageFromBody(body, "Bills/AP module is unavailable."),
      bills: [],
      summary: ZERO_SUMMARY,
      projects: [],
    };
  }
  const data = body as Partial<BillsPageData> & { ok?: boolean };
  return {
    available: data.available !== false,
    message: typeof data.message === "string" ? data.message : null,
    bills: Array.isArray(data.bills) ? data.bills : [],
    summary: data.summary ?? ZERO_SUMMARY,
    projects: Array.isArray(data.projects) ? data.projects : [],
  };
}

export async function fetchBillDetailData(id: string): Promise<BillDetailData | null> {
  const { status, body } = await apiJson(`/api/bills/${encodeURIComponent(id)}`);
  if (status === 404) return null;
  if (status >= 400) throw new Error(messageFromBody(body, "Failed to load bill."));
  const data = body as Partial<BillDetailData> & { ok?: boolean };
  if (!data.bill) return null;
  return {
    bill: data.bill,
    payments: Array.isArray(data.payments) ? data.payments : [],
  };
}
