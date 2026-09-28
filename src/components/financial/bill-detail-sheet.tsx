"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { BillDetailClient } from "@/app/bills/[id]/bill-detail-client";
import type { BillDetailData } from "@/app/bills/bills-api";
import { financePathWithReturn, financeRecordPath } from "@/lib/finance-navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";

let billTrigger: HTMLElement | null = null;
let billRecordId: string | null = null;
export function openBillDetail(id: string, pay = false, trigger?: HTMLElement | null) {
  billTrigger =
    trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  billRecordId =
    billTrigger?.closest<HTMLElement>("[data-finance-record]")?.dataset.financeRecord ?? id;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = new URL(financeRecordPath(current, "billDetail", id), window.location.origin);
  if (pay) next.searchParams.set("billPay", "1");
  window.history.replaceState(null, "", `${next.pathname}${next.search}${next.hash}`);
}

/** Real href remains available for new tabs; normal activation stays in the workspace. */
export function BillDetailLink({ href, onClick, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const url = new URL(String(href), window.location.origin);
        const match = url.pathname.match(/^\/bills\/([^/]+)$/);
        if (!match) return;
        event.preventDefault();
        event.stopPropagation();
        openBillDetail(
          decodeURIComponent(match[1]),
          url.searchParams.get("addPayment") === "1",
          event.currentTarget
        );
      }}
    />
  );
}

export function BillDetailSheet() {
  const params = useSearchParams();
  const pathname = usePathname();
  const id = params.get("billDetail");
  const [detail, setDetail] = React.useState<BillDetailData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [revision, refresh] = React.useReducer((value: number) => value + 1, 0);
  useOnAppSync(() => refresh(), []);
  React.useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setError(null);
    void fetch(`/api/bills/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.bill || !Array.isArray(body.payments))
          throw new Error(body.message || "Bill details unavailable.");
        setDetail(body);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setDetail(null);
          setError(error instanceof Error ? error.message : "Bill details unavailable.");
        }
      });
    return () => controller.abort();
  }, [id, revision]);
  const context = `${pathname}?${params}`;
  const current = detail?.bill.id === id ? detail : null;
  React.useEffect(() => {
    if (!id) return;
    const saved = sessionStorage.getItem(`hh:bill-workspace-scroll:${context}`);
    if (saved !== null) {
      const root = document.querySelector<HTMLElement>("[data-app-scroll-root]");
      if (root) root.scrollTo({ top: Number(saved), behavior: "instant" });
      sessionStorage.removeItem(`hh:bill-workspace-scroll:${context}`);
    }
  }, [id, context]);
  return (
    <Sheet
      open={!!id}
      onOpenChange={(open) => {
        if (open) return;
        const next = new URL(
          financeRecordPath(
            `${window.location.pathname}${window.location.search}${window.location.hash}`,
            "billDetail",
            null
          ),
          window.location.origin
        );
        next.searchParams.delete("billPay");
        window.history.replaceState(null, "", `${next.pathname}${next.search}${next.hash}`);
      }}
    >
      <SheetContent
        className="md:max-w-3xl"
        onClickCapture={(event) => {
          if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
          const root = document.querySelector<HTMLElement>("[data-app-scroll-root]");
          if (root)
            sessionStorage.setItem(`hh:bill-workspace-scroll:${context}`, String(root.scrollTop));
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = billTrigger?.isConnected
            ? billTrigger
            : Array.from(document.querySelectorAll<HTMLElement>("[data-finance-record]")).find(
                (element) =>
                  element.dataset.financeRecord === billRecordId &&
                  element.getClientRects().length > 0
              );
          target?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader className="mb-4 pr-11 text-left">
          <SheetTitle>{current?.bill.bill_no || "Bill details"}</SheetTitle>
          <SheetDescription>
            Review this bill and its payments without leaving your workspace.
          </SheetDescription>
        </SheetHeader>
        {error ? (
          <div role="alert" className="space-y-3">
            <p>{error}</p>
            <Button variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : !current ? (
          <p role="status">Loading bill…</p>
        ) : (
          <BillDetailClient
            key={id}
            bill={current.bill}
            payments={current.payments}
            addPaymentOpen={params.get("billPay") === "1"}
            drawerReturnTo={context}
          />
        )}
        {id ? (
          <Button asChild variant="ghost" className="mt-4">
            <Link href={financePathWithReturn(`/bills/${id}`, context)}>Open full page</Link>
          </Button>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
