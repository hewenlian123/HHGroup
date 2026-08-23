import type { SupabaseClient } from "@supabase/supabase-js";

export type EstimateActivityEventType =
  | "estimate_created"
  | "marked_sent"
  | "approved"
  | "rejected"
  | "revision_created"
  | "draft_invoice_created"
  | "converted_to_project";

export type EstimateActivityRelatedRecordType = "estimate_revision" | "invoice" | "project";

export type EstimateActivityActor = {
  userId: string;
  label: string;
};

export type EstimateActivityEvent = {
  id: string;
  estimateId: string;
  revisionRootId: string;
  revisionNumber: number;
  eventType: EstimateActivityEventType;
  actorUserId: string;
  actorLabel: string;
  occurredAt: string;
  relatedRecordType: EstimateActivityRelatedRecordType | null;
  relatedRecordId: string | null;
  metadata: Record<string, unknown>;
};

export type EstimateActivityPresentation = {
  title: string;
  detail: string | null;
  relatedHref: string | null;
  relatedLabel: string | null;
};

type StrictAuthLike = {
  email: string | null;
  role: string;
  user: { id: string };
};

type EstimateStatus = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function metadataInteger(metadata: Record<string, unknown>, key: string): number | null {
  const value = Number(metadata[key]);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function estimateActivityActorFromAuth(context: StrictAuthLike): EstimateActivityActor {
  const userId = requireUuid(context.user.id, "Activity actor");
  const email = context.email?.trim().toLowerCase();
  const role = context.role.trim() || "owner/admin";
  return {
    userId,
    label: email || `${role} (${userId.slice(0, 8)})`,
  };
}

function rpcError(error: { message?: string } | null | undefined, fallback: string): Error {
  return new Error(error?.message?.trim() || fallback);
}

export async function recordEstimateCreatedActivityWithClient(
  db: SupabaseClient,
  estimateId: string,
  actor: EstimateActivityActor,
  options: {
    creationMethod?: "new" | "duplicate" | "copy_previous" | "revision";
    sourceEstimateId?: string | null;
  } = {}
): Promise<void> {
  const { data, error } = await db.rpc("record_estimate_created_activity", {
    p_estimate_id: requireUuid(estimateId, "Estimate"),
    p_actor_user_id: requireUuid(actor.userId, "Activity actor"),
    p_actor_label: actor.label.trim(),
    p_creation_method: options.creationMethod ?? "new",
    p_source_estimate_id: options.sourceEstimateId
      ? requireUuid(options.sourceEstimateId, "Source Estimate")
      : null,
  });
  if (error || data !== true) {
    throw rpcError(error, "Could not record Estimate creation activity.");
  }
}

export async function transitionEstimateStatusWithActivityWithClient(
  db: SupabaseClient,
  estimateId: string,
  nextStatus: EstimateStatus,
  actor: EstimateActivityActor,
  related?: { type: "project"; id: string } | null
): Promise<boolean> {
  const { data, error } = await db.rpc("transition_estimate_status_with_activity", {
    p_estimate_id: requireUuid(estimateId, "Estimate"),
    p_next_status: nextStatus,
    p_actor_user_id: requireUuid(actor.userId, "Activity actor"),
    p_actor_label: actor.label.trim(),
    p_related_record_id: related ? requireUuid(related.id, "Related record") : null,
    p_related_record_type: related?.type ?? null,
  });
  if (error) throw rpcError(error, "Could not update Estimate status.");
  return data === true;
}

export async function linkEstimateMilestoneInvoiceWithActivityWithClient(
  db: SupabaseClient,
  input: {
    estimateId: string;
    scheduleItemId: string;
    invoiceId: string;
    actor: EstimateActivityActor;
  }
): Promise<{ invoiceId: string; linked: boolean }> {
  const { data, error } = await db.rpc("link_estimate_milestone_invoice_with_activity", {
    p_estimate_id: requireUuid(input.estimateId, "Estimate"),
    p_schedule_item_id: requireUuid(input.scheduleItemId, "Payment schedule item"),
    p_invoice_id: requireUuid(input.invoiceId, "Invoice"),
    p_actor_user_id: requireUuid(input.actor.userId, "Activity actor"),
    p_actor_label: input.actor.label.trim(),
  });
  if (error) throw rpcError(error, "Could not link invoice to Estimate activity.");

  const row = (Array.isArray(data) ? data[0] : data) as {
    linked_invoice_id?: unknown;
    linked?: unknown;
  } | null;
  const invoiceId = String(row?.linked_invoice_id ?? "").trim();
  if (!UUID_PATTERN.test(invoiceId)) {
    throw new Error("Invoice linkage did not return an authoritative Invoice.");
  }
  return { invoiceId, linked: row?.linked === true };
}

export async function getEstimateActivityWithClient(
  db: SupabaseClient,
  estimateId: string,
  limit = 100
): Promise<EstimateActivityEvent[]> {
  const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
  const { data, error } = await db
    .from("estimate_activity_events")
    .select(
      "id, estimate_id, revision_root_id, revision_number, event_type, actor_user_id, actor_label, occurred_at, related_record_type, related_record_id, metadata"
    )
    .eq("estimate_id", requireUuid(estimateId, "Estimate"))
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw rpcError(error, "Could not load Estimate activity.");

  return (data ?? []).map((row) => ({
    id: String(row.id),
    estimateId: String(row.estimate_id),
    revisionRootId: String(row.revision_root_id),
    revisionNumber: Number(row.revision_number),
    eventType: row.event_type as EstimateActivityEventType,
    actorUserId: String(row.actor_user_id),
    actorLabel: String(row.actor_label),
    occurredAt: String(row.occurred_at),
    relatedRecordType:
      (row.related_record_type as EstimateActivityRelatedRecordType | null) ?? null,
    relatedRecordId: row.related_record_id ? String(row.related_record_id) : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
  }));
}

export function formatEstimateActivityEvent(
  event: EstimateActivityEvent
): EstimateActivityPresentation {
  const relatedId = event.relatedRecordId;
  switch (event.eventType) {
    case "estimate_created": {
      const sourceRevision = metadataInteger(event.metadata, "source_revision_number");
      const creationMethod = metadataString(event.metadata, "creation_method");
      const detail =
        creationMethod === "revision" && sourceRevision != null
          ? `Rev ${event.revisionNumber} created from Rev ${sourceRevision}`
          : creationMethod === "duplicate" || creationMethod === "copy_previous"
            ? "Draft created from a previous Estimate"
            : "Draft created";
      return { title: "Estimate Created", detail, relatedHref: null, relatedLabel: null };
    }
    case "marked_sent":
      return { title: "Marked as Sent", detail: null, relatedHref: null, relatedLabel: null };
    case "approved":
      return { title: "Approved", detail: null, relatedHref: null, relatedLabel: null };
    case "rejected":
      return { title: "Rejected", detail: null, relatedHref: null, relatedLabel: null };
    case "revision_created": {
      const relatedRevision = metadataInteger(event.metadata, "related_revision_number");
      return {
        title: "Revision Created",
        detail:
          relatedRevision == null
            ? `Created from Rev ${event.revisionNumber}`
            : `Rev ${relatedRevision} created from Rev ${event.revisionNumber}`,
        relatedHref: relatedId ? `/estimates/${relatedId}` : null,
        relatedLabel: relatedRevision == null ? "Open revision" : `Open Rev ${relatedRevision}`,
      };
    }
    case "draft_invoice_created": {
      const invoiceNo = metadataString(event.metadata, "invoice_no");
      return {
        title: "Draft Invoice Created",
        detail: invoiceNo ? `Invoice ${invoiceNo}` : null,
        relatedHref: relatedId ? `/financial/invoices/${relatedId}` : null,
        relatedLabel: invoiceNo ? `Open ${invoiceNo}` : "Open Invoice",
      };
    }
    case "converted_to_project": {
      const projectName = metadataString(event.metadata, "project_name");
      return {
        title: "Converted to Project",
        detail: projectName,
        relatedHref: relatedId ? `/projects/${relatedId}` : null,
        relatedLabel: "Open Project",
      };
    }
  }
}
