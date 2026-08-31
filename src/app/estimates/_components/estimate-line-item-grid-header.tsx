import * as React from "react";

import { EB } from "./estimate-builder-ui";

export function EstimateLineItemGridHeader(): React.ReactElement {
  return (
    <div
      className={EB.lineItemGridHeader}
      data-testid="estimate-line-item-grid-header"
      aria-hidden="true"
    >
      <span className="text-left">#</span>
      <span>Item details</span>
      <span>Qty / Unit</span>
      <span className="text-right">Unit price</span>
      <span className="text-right">Line total</span>
    </div>
  );
}
