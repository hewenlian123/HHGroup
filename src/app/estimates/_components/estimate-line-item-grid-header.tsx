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
      <span>Item</span>
      <span>Description</span>
      <span className="text-right">Qty</span>
      <span>Unit</span>
      <span className="text-right">Unit price</span>
      <span className="text-right">Line total</span>
      <span className="text-center">Actions</span>
    </div>
  );
}
