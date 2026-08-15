export type ExpenseFormGroup =
  | "high_frequency"
  | "payment"
  | "additional"
  | "evidence"
  | "more_details";

export type ExpenseFormAvailability = "editable" | "derived" | "read_only" | "data_contract_issue";

export type ExpenseFormFieldDefinition = {
  label: string;
  group: ExpenseFormGroup;
  canonicalValue: string;
  create: ExpenseFormAvailability;
  edit: ExpenseFormAvailability;
};

/**
 * Shared presentation metadata for the canonical Expense field universe.
 *
 * This does not define persistence or validation. New and Edit continue to use
 * their existing canonical handlers; the metadata keeps labels and grouping
 * from drifting while making protected contract gaps explicit.
 */
export const EXPENSE_FORM_FIELDS = {
  amount: {
    label: "Amount",
    group: "high_frequency",
    canonicalValue: "expense_lines.amount",
    create: "editable",
    edit: "editable",
  },
  vendor: {
    label: "Vendor",
    group: "high_frequency",
    canonicalValue: "expenses.vendor_name",
    create: "editable",
    edit: "editable",
  },
  project: {
    label: "Project",
    group: "high_frequency",
    canonicalValue: "expense_lines.project_id",
    create: "editable",
    edit: "editable",
  },
  classification: {
    label: "Classification",
    group: "high_frequency",
    canonicalValue: "derived from project assignment",
    create: "derived",
    edit: "derived",
  },
  category: {
    label: "Category",
    group: "high_frequency",
    canonicalValue: "expense_lines.category",
    create: "editable",
    edit: "editable",
  },
  date: {
    label: "Date",
    group: "high_frequency",
    canonicalValue: "expenses.expense_date",
    create: "editable",
    edit: "editable",
  },
  paymentSource: {
    label: "Payment source",
    group: "payment",
    canonicalValue: "expenses.source_type",
    create: "data_contract_issue",
    edit: "editable",
  },
  paymentMethod: {
    label: "Payment method",
    group: "payment",
    canonicalValue: "expenses.payment_method",
    create: "data_contract_issue",
    edit: "editable",
  },
  paymentAccount: {
    label: "Payment account",
    group: "payment",
    canonicalValue: "expenses.payment_account_id",
    create: "editable",
    edit: "editable",
  },
  worker: {
    label: "Worker",
    group: "additional",
    canonicalValue: "expenses.worker_id",
    create: "data_contract_issue",
    edit: "editable",
  },
  subcontractDeduction: {
    label: "Deduct from subcontractor",
    group: "additional",
    canonicalValue: "subcontract_deductions",
    create: "editable",
    edit: "editable",
  },
  attachments: {
    label: "Attachments",
    group: "evidence",
    canonicalValue: "protected expense attachment relationship",
    create: "editable",
    edit: "editable",
  },
  description: {
    label: "Description",
    group: "more_details",
    canonicalValue: "expenses.notes",
    create: "editable",
    edit: "editable",
  },
  items: {
    label: "Items",
    group: "more_details",
    canonicalValue: "Items: convention in expenses.notes",
    create: "editable",
    edit: "editable",
  },
} as const satisfies Record<string, ExpenseFormFieldDefinition>;

function titleCaseExpenseItem(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function normalizeExpenseItems(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const rawValue of values) {
    const item = titleCaseExpenseItem(rawValue);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

export function parseExpenseDescription(value: string | null | undefined): {
  description: string;
  items: string[];
} {
  const lines = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const itemLineIndex = lines.findLastIndex((line) => /^Items:\s*.+$/i.test(line.trim()));
  if (itemLineIndex < 0) {
    return { description: lines.join("\n").trim(), items: [] };
  }

  const itemLine = lines[itemLineIndex]!.trim().replace(/^Items:\s*/i, "");
  return {
    description: lines
      .filter((_, index) => index !== itemLineIndex)
      .join("\n")
      .trim(),
    items: normalizeExpenseItems(itemLine.split(",")),
  };
}

export function composeExpenseDescription(
  description: string | null | undefined,
  items: readonly string[]
): string | undefined {
  const cleanDescription = String(description ?? "").trim();
  const cleanItems = normalizeExpenseItems(items);
  const parts = cleanDescription ? [cleanDescription] : [];
  if (cleanItems.length > 0) parts.push(`Items: ${cleanItems.join(", ")}`);
  return parts.join("\n") || undefined;
}

/**
 * Clean technical inbox-upload noise without collapsing the existing structured
 * Items line into the free-text description during optimistic reconciliation.
 */
export function cleanExpenseDescriptionForDisplay(
  value: string | null | undefined,
  cleanDescription: (description: string) => string
): string | undefined {
  const parsed = parseExpenseDescription(value);
  return composeExpenseDescription(cleanDescription(parsed.description), parsed.items);
}
