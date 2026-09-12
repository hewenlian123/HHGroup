import * as React from "react";

import { EB } from "./estimate-builder-ui";

export function EstimateLineItemGridHeader(): React.ReactElement {
  return (
    <div
      className={EB.lineItemGridHeader}
      data-testid="estimate-line-item-grid-header"
      aria-hidden="true"
    >
      <span aria-hidden />
      <span>Item Name / Description</span>
      <span aria-hidden />
      <span className="text-right">Qty</span>
      <span>Unit</span>
      <span className="text-right">Unit Cost</span>
      <span className="text-right">Total Price</span>
      <span aria-hidden />
    </div>
  );
}
