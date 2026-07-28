import type { ExpenseReceiptItem } from "@/lib/expense-receipt-items";

export type ExpenseReceiptApiItem = {
  id: string;
  fileName: string;
  mimeType: string;
  signedUrl: string;
  referenceVersion: string;
};

export type ExpenseReceiptApiManifest = {
  expenseId: string;
  expiresAt: string;
  items: ExpenseReceiptApiItem[];
};

type ReceiptApiEnvelope = {
  ok?: boolean;
  message?: string;
  expenseId?: string;
  expiresAt?: string;
  items?: ExpenseReceiptApiItem[];
  item?: ExpenseReceiptApiItem;
};

export class ExpenseReceiptApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ExpenseReceiptApiError";
  }
}

function safeApiMessage(status: number): string {
  if (status === 401) return "Sign in again to view this receipt.";
  if (status === 403) return "You do not have access to this receipt.";
  if (status === 409) return "This receipt changed. Refresh it before replacing.";
  return "Receipt preview is unavailable.";
}

function assertManifest(body: ReceiptApiEnvelope, expenseId: string): ExpenseReceiptApiManifest {
  if (
    body.ok !== true ||
    body.expenseId !== expenseId ||
    typeof body.expiresAt !== "string" ||
    !Array.isArray(body.items)
  ) {
    throw new ExpenseReceiptApiError("Receipt preview is unavailable.", 502);
  }
  return {
    expenseId,
    expiresAt: body.expiresAt,
    items: body.items,
  };
}

export async function fetchExpenseReceiptManifest(
  expenseId: string,
  signal?: AbortSignal
): Promise<ExpenseReceiptApiManifest> {
  const requestId = crypto.randomUUID();
  const response = await fetch(
    `/api/financial/expenses/${encodeURIComponent(expenseId)}/receipts?request=${encodeURIComponent(requestId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    }
  );
  const body = (await response.json().catch(() => ({}))) as ReceiptApiEnvelope;
  if (!response.ok)
    throw new ExpenseReceiptApiError(safeApiMessage(response.status), response.status);
  return assertManifest(body, expenseId);
}

export async function replaceExpenseReceipt(input: {
  expenseId: string;
  item: ExpenseReceiptApiItem;
  file: File;
  idempotencyKey?: string;
}): Promise<ExpenseReceiptApiItem> {
  const formData = new FormData();
  formData.set("file", input.file);
  formData.set("referenceVersion", input.item.referenceVersion);
  formData.set("idempotencyKey", input.idempotencyKey ?? crypto.randomUUID());

  const response = await fetch(
    `/api/financial/expenses/${encodeURIComponent(input.expenseId)}/receipts/${encodeURIComponent(input.item.id)}/replace`,
    {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    }
  );
  const body = (await response.json().catch(() => ({}))) as ReceiptApiEnvelope;
  if (!response.ok || body.ok !== true || !body.item) {
    throw new ExpenseReceiptApiError(safeApiMessage(response.status), response.status);
  }
  return body.item;
}

export function receiptApiItemToExpenseReceiptItem(
  item: ExpenseReceiptApiItem
): ExpenseReceiptItem {
  return {
    id: item.id,
    fileName: item.fileName,
    mimeType: item.mimeType,
    referenceVersion: item.referenceVersion,
    url: item.signedUrl,
  };
}
