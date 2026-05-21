export const ESTIMATE_LINE_ITEM_STATUSES = [
  "included",
  "optional",
  "allowance",
  "excluded",
  "owner_supplied",
] as const;

export type EstimateLineItemStatus = (typeof ESTIMATE_LINE_ITEM_STATUSES)[number];

export const DEFAULT_LINE_ITEM_STATUS: EstimateLineItemStatus = "included";

export const LINE_ITEM_STATUS_LABELS: Record<EstimateLineItemStatus, string> = {
  included: "Included",
  optional: "Optional",
  allowance: "Allowance",
  excluded: "Excluded",
  owner_supplied: "Owner supplied",
};

export function isDefaultLineItemStatus(status: EstimateLineItemStatus | undefined): boolean {
  return !status || status === DEFAULT_LINE_ITEM_STATUS;
}
