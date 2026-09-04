type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

type PunchInput = {
  inspection_date: string | null;
  inspector: string | null;
  notes: string | null;
  contractor_signature: string | null;
  client_signature: string | null;
  items: Array<{ item: string; status: "pending" | "done" }>;
};

type WarrantyInput = {
  start_date: string | null;
  period_months: number;
  notes: string | null;
};

type CompletionInput = {
  completion_date: string | null;
  contractor_name: string | null;
  client_name: string | null;
  contractor_signature: string | null;
  client_signature: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > maxLength) return undefined;
  return value;
}

function optionalDate(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }
  return value;
}

function invalid<T>(): ValidationResult<T> {
  return { ok: false, message: "Invalid closeout input." };
}

export function parseCloseoutPunchInput(value: unknown): ValidationResult<PunchInput> {
  const body = record(value);
  if (!body) return invalid();
  const inspectionDate = optionalDate(body.inspection_date);
  const inspector = optionalText(body.inspector, 300);
  const notes = optionalText(body.notes, 4000);
  const contractorSignature = optionalText(body.contractor_signature, 2000);
  const clientSignature = optionalText(body.client_signature, 2000);
  const rawItems = body.items ?? [];
  if (
    inspectionDate === undefined ||
    inspector === undefined ||
    notes === undefined ||
    contractorSignature === undefined ||
    clientSignature === undefined ||
    !Array.isArray(rawItems) ||
    rawItems.length > 200
  ) {
    return invalid();
  }
  const items: PunchInput["items"] = [];
  for (const rawItem of rawItems) {
    const item = record(rawItem);
    if (!item || Object.keys(item).sort().join(",") !== "item,status") return invalid();
    if (
      typeof item.item !== "string" ||
      item.item.length > 1000 ||
      (item.status !== "pending" && item.status !== "done")
    ) {
      return invalid();
    }
    items.push({ item: item.item, status: item.status });
  }
  return {
    ok: true,
    value: {
      inspection_date: inspectionDate,
      inspector,
      notes,
      contractor_signature: contractorSignature,
      client_signature: clientSignature,
      items,
    },
  };
}

export function parseCloseoutWarrantyInput(value: unknown): ValidationResult<WarrantyInput> {
  const body = record(value);
  if (!body) return invalid();
  const startDate = optionalDate(body.start_date);
  const notes = optionalText(body.notes, 4000);
  const periodMonths = body.period_months ?? 12;
  if (
    startDate === undefined ||
    notes === undefined ||
    typeof periodMonths !== "number" ||
    !Number.isSafeInteger(periodMonths) ||
    periodMonths < 1
  ) {
    return invalid();
  }
  return {
    ok: true,
    value: { start_date: startDate, period_months: periodMonths, notes },
  };
}

export function parseCloseoutCompletionInput(value: unknown): ValidationResult<CompletionInput> {
  const body = record(value);
  if (!body) return invalid();
  const completionDate = optionalDate(body.completion_date);
  const contractorName = optionalText(body.contractor_name, 300);
  const clientName = optionalText(body.client_name, 300);
  const contractorSignature = optionalText(body.contractor_signature, 2000);
  const clientSignature = optionalText(body.client_signature, 2000);
  if (
    completionDate === undefined ||
    contractorName === undefined ||
    clientName === undefined ||
    contractorSignature === undefined ||
    clientSignature === undefined
  ) {
    return invalid();
  }
  return {
    ok: true,
    value: {
      completion_date: completionDate,
      contractor_name: contractorName,
      client_name: clientName,
      contractor_signature: contractorSignature,
      client_signature: clientSignature,
    },
  };
}
