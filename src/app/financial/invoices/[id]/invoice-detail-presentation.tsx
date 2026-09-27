import { createElement, type ReactNode } from "react";

type InvoiceDetailPresentationProps = {
  overview?: ReactNode;
  payments?: ReactNode;
  activity?: ReactNode;
  inspector?: ReactNode;
  children?: ReactNode;
};

/**
 * Route-local semantic layout only. Invoice values, workflow actions, and
 * persistence remain owned by the detail route and its existing handlers.
 */
export function InvoiceDetailPresentation({
  overview,
  payments,
  activity,
  inspector,
  children,
}: InvoiceDetailPresentationProps) {
  if (children) {
    return createElement(
      "div",
      {
        "data-invoice-detail-presentation": "true",
        className: "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start",
      },
      children
    );
  }

  return createElement(
    "div",
    { className: "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start" },
    createElement(
      "div",
      { className: "min-w-0 space-y-4" },
      createElement("section", { "aria-label": "Invoice overview" }, overview),
      createElement("section", { "aria-label": "Payments" }, payments),
      createElement("section", { "aria-label": "Activity" }, activity)
    ),
    createElement(
      "aside",
      { "aria-label": "Invoice context", className: "min-w-0 xl:sticky xl:top-4" },
      inspector
    )
  );
}
