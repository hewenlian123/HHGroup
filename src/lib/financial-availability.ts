export type FinancialAvailabilityFailureKind =
  | "permission_denied"
  | "schema_failure"
  | "network_failure"
  | "unavailable_source"
  | "unknown_failure";

type FailureShape = {
  code?: unknown;
  message?: unknown;
};

function failureShape(failure: unknown): FailureShape | null {
  if (!failure || typeof failure !== "object") return null;
  return failure as FailureShape;
}

export function classifyFinancialAvailabilityFailure(
  failure: unknown
): FinancialAvailabilityFailureKind {
  if (failure == null) return "unavailable_source";
  const shape = failureShape(failure);
  const code = String(shape?.code ?? "").toUpperCase();
  const message = String(
    shape?.message ?? (failure instanceof Error ? failure.message : failure)
  ).toLowerCase();

  if (
    code === "42501" ||
    code === "PGRST301" ||
    /permission denied|row-level security|violates row-level security|not authorized|jwt expired/.test(
      message
    )
  ) {
    return "permission_denied";
  }
  if (
    ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    /schema cache|relation .* does not exist|column .* does not exist|table .* does not exist/.test(
      message
    )
  ) {
    return "schema_failure";
  }
  if (
    /fetch failed|network|econnreset|econnrefused|enotfound|etimedout|timeout|socket/.test(message)
  ) {
    return "network_failure";
  }
  return "unknown_failure";
}

export class FinancialDataUnavailableError extends Error {
  readonly kind: FinancialAvailabilityFailureKind;
  readonly source: string;

  constructor(source: string, failure: unknown) {
    const shape = failureShape(failure);
    const detail = String(
      shape?.message ?? (failure instanceof Error ? failure.message : "")
    ).trim();
    super(detail ? `${source}: ${detail}` : `${source} is unavailable.`);
    this.name = "FinancialDataUnavailableError";
    this.kind = classifyFinancialAvailabilityFailure(failure);
    this.source = source;
    if (failure !== undefined) this.cause = failure;
  }
}

export function financialDataUnavailable(source: string, failure: unknown): never {
  if (failure instanceof FinancialDataUnavailableError) throw failure;
  throw new FinancialDataUnavailableError(source, failure);
}
