import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";
import type { EstimateNoteBlock } from "@/lib/estimate-notes";

export const ESTIMATE_NEW_DRAFT_STORAGE_KEY = "hh_estimate_new_draft_v1";
export const ESTIMATE_NEW_DRAFT_VERSION = 1;

export type EstimateDraftRecoveryState = "saved" | "unsaved" | "recoverable" | "stale";

export type EstimateNewDraftLineItem = {
  id: string;
  costCode: string;
  title: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  hideAmountOnPdf: boolean;
  status?: "included" | "optional" | "allowance" | "excluded" | "owner_supplied";
};

export type EstimateNewDraftMilestone = {
  id: string;
  title: string;
  description: string;
  amount: number;
  dueDate?: string;
};

export type EstimateNewDraftData = {
  clientName: string;
  projectName: string;
  address: string;
  phone: string;
  email: string;
  selectedCustomer: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  estimateDate: string;
  validUntil: string;
  salesPerson: string;
  tax: number;
  taxTouched: boolean;
  templateDefaultTaxPct: number | null;
  discount: number;
  documentStyle: EstimateDocumentStyle;
  categoryNames: Record<string, string>;
  sectionOrder: string[];
  lineItems: EstimateNewDraftLineItem[];
  estimateNotes: EstimateNoteBlock[];
  paymentMilestones: EstimateNewDraftMilestone[];
  selectedTemplateId: string;
};

export type EstimateNewDraftEnvelope = {
  version: typeof ESTIMATE_NEW_DRAFT_VERSION;
  updatedAt: number;
  draft: EstimateNewDraftData;
};

export type EstimateNewDraftReadResult =
  | { state: "empty" }
  | { state: "recoverable"; envelope: EstimateNewDraftEnvelope }
  | { state: "stale"; reason: string; updatedAt?: number };

const LINE_ITEM_STATUSES = new Set([
  "included",
  "optional",
  "allowance",
  "excluded",
  "owner_supplied",
]);
const NOTE_TYPES = new Set([
  "exclusions",
  "assumptions",
  "payment_terms",
  "warranty",
  "schedule_note",
  "custom",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableFiniteNumber(value: unknown): number | null {
  return value === null ? null : finiteNumber(value);
}

function normalizeCustomer(value: unknown): EstimateNewDraftData["selectedCustomer"] {
  if (!isRecord(value) || !stringValue(value.id)) return null;
  return {
    id: stringValue(value.id),
    name: stringValue(value.name),
    ...(value.address === null
      ? { address: null }
      : typeof value.address === "string"
        ? { address: value.address }
        : {}),
    ...(value.phone === null
      ? { phone: null }
      : typeof value.phone === "string"
        ? { phone: value.phone }
        : {}),
    ...(value.email === null
      ? { email: null }
      : typeof value.email === "string"
        ? { email: value.email }
        : {}),
  };
}

function normalizeLineItems(value: unknown): EstimateNewDraftLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !stringValue(entry.id) || !stringValue(entry.costCode)) return [];
    const status = stringValue(entry.status);
    return [
      {
        id: stringValue(entry.id),
        costCode: stringValue(entry.costCode),
        title: stringValue(entry.title),
        description: stringValue(entry.description),
        qty: finiteNumber(entry.qty),
        unit: stringValue(entry.unit) || "EA",
        unitPrice: finiteNumber(entry.unitPrice),
        hideAmountOnPdf: entry.hideAmountOnPdf === true,
        status: LINE_ITEM_STATUSES.has(status)
          ? (status as EstimateNewDraftLineItem["status"])
          : "included",
      },
    ];
  });
}

function normalizeNotes(value: unknown): EstimateNoteBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !stringValue(entry.id)) return [];
    const type = stringValue(entry.type);
    if (!NOTE_TYPES.has(type)) return [];
    return [
      {
        id: stringValue(entry.id),
        type: type as EstimateNoteBlock["type"],
        title: stringValue(entry.title),
        body: stringValue(entry.body),
      },
    ];
  });
}

function normalizeMilestones(value: unknown): EstimateNewDraftMilestone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !stringValue(entry.id)) return [];
    const dueDate = stringValue(entry.dueDate);
    return [
      {
        id: stringValue(entry.id),
        title: stringValue(entry.title),
        description: stringValue(entry.description),
        amount: finiteNumber(entry.amount),
        ...(dueDate ? { dueDate } : {}),
      },
    ];
  });
}

function normalizeDraft(value: unknown): EstimateNewDraftData | null {
  if (!isRecord(value)) return null;
  const categoryNames = isRecord(value.categoryNames)
    ? Object.fromEntries(
        Object.entries(value.categoryNames).flatMap(([key, name]) =>
          typeof name === "string" ? [[key, name]] : []
        )
      )
    : {};
  return {
    clientName: stringValue(value.clientName),
    projectName: stringValue(value.projectName),
    address: stringValue(value.address),
    phone: stringValue(value.phone),
    email: stringValue(value.email),
    selectedCustomer: normalizeCustomer(value.selectedCustomer),
    estimateDate: stringValue(value.estimateDate),
    validUntil: stringValue(value.validUntil),
    salesPerson: stringValue(value.salesPerson),
    tax: finiteNumber(value.tax),
    taxTouched: value.taxTouched === true,
    templateDefaultTaxPct: nullableFiniteNumber(value.templateDefaultTaxPct),
    discount: finiteNumber(value.discount),
    documentStyle: value.documentStyle === "itemized" ? "itemized" : "proposal",
    categoryNames,
    sectionOrder: Array.isArray(value.sectionOrder)
      ? value.sectionOrder.filter((entry): entry is string => typeof entry === "string")
      : [],
    lineItems: normalizeLineItems(value.lineItems),
    estimateNotes: normalizeNotes(value.estimateNotes),
    paymentMilestones: normalizeMilestones(value.paymentMilestones),
    selectedTemplateId: stringValue(value.selectedTemplateId),
  };
}

export function parseEstimateNewDraftRecovery(raw: string | null): EstimateNewDraftReadResult {
  if (!raw) return { state: "empty" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { state: "stale", reason: "Draft data is invalid." };
    const updatedAt = finiteNumber(parsed.updatedAt) || undefined;
    if (parsed.version !== ESTIMATE_NEW_DRAFT_VERSION) {
      return { state: "stale", reason: "Draft format is no longer supported.", updatedAt };
    }
    const draft = normalizeDraft(parsed.draft);
    if (!draft || !updatedAt) {
      return { state: "stale", reason: "Draft data is incomplete.", updatedAt };
    }
    return {
      state: "recoverable",
      envelope: { version: ESTIMATE_NEW_DRAFT_VERSION, updatedAt, draft },
    };
  } catch {
    return { state: "stale", reason: "Draft data could not be read." };
  }
}

export function readEstimateNewDraftRecovery(
  storage?: Pick<Storage, "getItem"> | null
): EstimateNewDraftReadResult {
  try {
    const target =
      storage === undefined
        ? typeof window === "undefined"
          ? null
          : window.localStorage
        : storage;
    if (!target) return { state: "empty" };
    return parseEstimateNewDraftRecovery(target.getItem(ESTIMATE_NEW_DRAFT_STORAGE_KEY));
  } catch {
    return { state: "stale", reason: "Local draft storage is unavailable." };
  }
}

export function writeEstimateNewDraftRecovery(
  draft: EstimateNewDraftData,
  updatedAt = Date.now(),
  storage?: Pick<Storage, "setItem"> | null
): EstimateNewDraftEnvelope | null {
  const envelope: EstimateNewDraftEnvelope = {
    version: ESTIMATE_NEW_DRAFT_VERSION,
    updatedAt,
    draft,
  };
  try {
    const target =
      storage === undefined
        ? typeof window === "undefined"
          ? null
          : window.localStorage
        : storage;
    if (!target) return null;
    target.setItem(ESTIMATE_NEW_DRAFT_STORAGE_KEY, JSON.stringify(envelope));
    return envelope;
  } catch {
    return null;
  }
}

export function clearEstimateNewDraftRecovery(
  storage?: Pick<Storage, "removeItem"> | null
): boolean {
  try {
    const target =
      storage === undefined
        ? typeof window === "undefined"
          ? null
          : window.localStorage
        : storage;
    if (!target) return false;
    target.removeItem(ESTIMATE_NEW_DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isMeaningfulEstimateNewDraft(draft: EstimateNewDraftData): boolean {
  return Boolean(
    draft.clientName.trim() ||
    draft.projectName.trim() ||
    draft.address.trim() ||
    draft.phone.trim() ||
    draft.email.trim() ||
    draft.selectedCustomer ||
    draft.validUntil ||
    draft.salesPerson.trim() ||
    draft.tax !== 0 ||
    draft.discount !== 0 ||
    draft.documentStyle !== "proposal" ||
    Object.keys(draft.categoryNames).length ||
    draft.sectionOrder.length ||
    draft.lineItems.length ||
    draft.estimateNotes.length ||
    draft.paymentMilestones.length ||
    draft.selectedTemplateId
  );
}

export function recoveryCandidateState(
  candidateUpdatedAt: number,
  currentEditedAt: number
): "recoverable" | "stale" {
  return currentEditedAt > candidateUpdatedAt ? "stale" : "recoverable";
}
