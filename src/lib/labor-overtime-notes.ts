const OT_HOURS_TOKEN_RE = /(?:^|[\s,])ot_hours=([0-9]+(?:\.[0-9]+)?)(?=$|[\s,])/i;
const OT_AMOUNT_TOKEN_RE = /(?:^|[\s,])ot_amount=([0-9]+(?:\.[0-9]+)?)(?=$|[\s,])/i;
const OT_TOKEN_GLOBAL_RE = /(^|[\s,])(?:ot_hours|ot_amount)=[0-9]+(?:\.[0-9]+)?(?=$|[\s,])/gi;

export function normalizeLaborOvertimeHours(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseLaborOvertimeHoursFromNotes(notes: unknown): number {
  const text = typeof notes === "string" ? notes : "";
  const match = OT_HOURS_TOKEN_RE.exec(text);
  return match ? normalizeLaborOvertimeHours(match[1]) : 0;
}

export function normalizeLaborOvertimeAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseLaborOvertimeAmountFromNotes(notes: unknown): number {
  const text = typeof notes === "string" ? notes : "";
  const match = OT_AMOUNT_TOKEN_RE.exec(text);
  return match ? normalizeLaborOvertimeAmount(match[1]) : 0;
}

export function stripLaborOvertimeTokensFromNotes(notes: unknown): string {
  const text = typeof notes === "string" ? notes : "";
  return text.replace(OT_TOKEN_GLOBAL_RE, " ").replace(/\s+/g, " ").trim();
}

export function stripLaborOvertimeHoursFromNotes(notes: unknown): string {
  return stripLaborOvertimeTokensFromNotes(notes);
}

export function mergeLaborOvertimeIntoNotes(
  notes: unknown,
  overtime: { hours?: unknown; amount?: unknown }
): string | null {
  const baseNotes = stripLaborOvertimeTokensFromNotes(notes);
  const otHours = normalizeLaborOvertimeHours(overtime.hours);
  const otAmount = normalizeLaborOvertimeAmount(overtime.amount);
  const parts = baseNotes ? [baseNotes] : [];
  if (otHours > 0) {
    parts.push(`ot_hours=${Number(otHours.toFixed(2))}`);
  }
  if (otAmount > 0) {
    parts.push(`ot_amount=${Number(otAmount.toFixed(2))}`);
  }
  return parts.join(" ").trim() || null;
}

export function mergeLaborOvertimeHoursIntoNotes(
  notes: unknown,
  overtimeHours: unknown
): string | null {
  return mergeLaborOvertimeIntoNotes(notes, { hours: overtimeHours });
}

export function hasLaborOvertimeInput(input: Record<string, unknown>): boolean {
  return hasLaborOvertimeHoursInput(input) || hasLaborOvertimeAmountInput(input);
}

export function hasLaborOvertimeHoursInput(input: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, "overtimeHours") ||
    Object.prototype.hasOwnProperty.call(input, "overtime_hours") ||
    Object.prototype.hasOwnProperty.call(input, "otHours") ||
    Object.prototype.hasOwnProperty.call(input, "ot_hours")
  );
}

export function hasLaborOvertimeAmountInput(input: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, "overtimeAmount") ||
    Object.prototype.hasOwnProperty.call(input, "overtime_amount") ||
    Object.prototype.hasOwnProperty.call(input, "otAmount") ||
    Object.prototype.hasOwnProperty.call(input, "ot_amount")
  );
}

export function readLaborOvertimeHoursInput(input: {
  overtimeHours?: unknown;
  overtime_hours?: unknown;
  otHours?: unknown;
  ot_hours?: unknown;
}): number {
  return normalizeLaborOvertimeHours(
    input.overtimeHours ?? input.overtime_hours ?? input.otHours ?? input.ot_hours
  );
}

export function readLaborOvertimeAmountInput(input: {
  overtimeAmount?: unknown;
  overtime_amount?: unknown;
  otAmount?: unknown;
  ot_amount?: unknown;
}): number {
  return normalizeLaborOvertimeAmount(
    input.overtimeAmount ?? input.overtime_amount ?? input.otAmount ?? input.ot_amount
  );
}
