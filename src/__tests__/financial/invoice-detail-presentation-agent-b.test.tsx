import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceDetailPresentation } from "@/app/financial/invoices/[id]/invoice-detail-presentation";

describe("InvoiceDetailPresentation", () => {
  it("groups the existing invoice detail content into overview, payments, and activity landmarks", () => {
    const html = renderToStaticMarkup(
      React.createElement(InvoiceDetailPresentation, {
        overview: React.createElement("p", null, "Invoice facts"),
        payments: React.createElement("p", null, "Posted payments"),
        activity: React.createElement("p", null, "Deposits and receipts"),
        inspector: React.createElement("p", null, "Customer · Project · Due date"),
      })
    );

    expect(html).toContain('aria-label="Invoice overview"');
    expect(html).toContain('aria-label="Payments"');
    expect(html).toContain('aria-label="Activity"');
    expect(html).toContain('aria-label="Invoice context"');
    expect(html).toContain("Invoice facts");
    expect(html).toContain("Posted payments");
    expect(html).toContain("Deposits and receipts");
    expect(html).toContain("Customer · Project · Due date");
  });

  it("keeps route-owned presentation children in the two-column layout", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        InvoiceDetailPresentation,
        null,
        React.createElement("main", { "data-testid": "route-owned-content" }, "Existing handlers"),
        React.createElement("aside", { "data-testid": "route-owned-inspector" }, "Read only")
      )
    );

    expect(html).toContain('data-invoice-detail-presentation="true"');
    expect(html).toContain('data-testid="route-owned-content"');
    expect(html).toContain('data-testid="route-owned-inspector"');
  });
});
