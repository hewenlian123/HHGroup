export const AP_BILL_TYPES = [
  "Vendor",
  "Labor",
  "Overhead",
  "Utility",
  "Permit",
  "Equipment",
  "Other",
] as const;
export type ApBillType = (typeof AP_BILL_TYPES)[number];

export const AP_BILL_STATUSES = ["Draft", "Pending", "Partially Paid", "Paid", "Void"] as const;
export type ApBillStatus = (typeof AP_BILL_STATUSES)[number];
