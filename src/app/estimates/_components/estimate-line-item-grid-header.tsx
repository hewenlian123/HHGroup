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
      <span>Item Name</span>
      <span>Description</span>
      <span className="text-right">Qty</span>
      <span>Unit</span>
      <span className="text-right">Unit price</span>
      <span className="text-right">Line total</span>
      <span className="text-center">More</span>
    </div>
  );
}
