"use client";

import * as React from "react";
import type { CostCode } from "@/lib/data";
import type { EditorLineItem } from "./estimate-line-item-model";
import {
  EstimateLineItemsLocal,
  type EstimateLineItemsLocalProps,
} from "./estimate-line-items-local";

export type EstimateLineItemsEditorLocalProps = {
  mode: "local";
  costCodes: CostCode[];
  lineItems: EditorLineItem[];
  onLineItemsChange: (items: EditorLineItem[]) => void;
  categoryNames: Record<string, string>;
  onCategoryNamesChange: (names: Record<string, string>) => void;
  disabled?: boolean;
  submitAttempted?: boolean;
  lineItemsError?: string | null;
};

/** Persisted line items render inside EstimateEditor (server actions + DnD). */
export type EstimateLineItemsEditorPersistedProps = {
  mode: "persisted";
  children: React.ReactNode;
};

export type EstimateLineItemsEditorProps =
  | EstimateLineItemsEditorLocalProps
  | EstimateLineItemsEditorPersistedProps;

export function EstimateLineItemsEditor(props: EstimateLineItemsEditorProps): React.ReactElement {
  if (props.mode === "local") {
    const localProps: EstimateLineItemsLocalProps = {
      costCodes: props.costCodes,
      lineItems: props.lineItems,
      onLineItemsChange: props.onLineItemsChange,
      categoryNames: props.categoryNames,
      onCategoryNamesChange: props.onCategoryNamesChange,
      disabled: props.disabled,
      submitAttempted: props.submitAttempted,
      lineItemsError: props.lineItemsError,
    };
    return <EstimateLineItemsLocal {...localProps} />;
  }
  return <>{props.children}</>;
}
