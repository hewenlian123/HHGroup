import "server-only";

import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export type SecurityAuditEventType =
  | "login_succeeded"
  | "login_failed"
  | "logout"
  | "password_changed"
  | "password_reset"
  | "sessions_revoked"
  | "pin_enabled"
  | "pin_changed"
  | "pin_disabled"
  | "pin_unlock_succeeded"
  | "pin_unlock_failed"
  | "pin_locked"
  | "receipt_viewed"
  | "receipt_replaced"
  | "receipt_replace_failed";

export async function recordSecurityAudit(input: {
  eventType: SecurityAuditEventType;
  userId: string | null;
  metadata?: Record<string, boolean | number | string | null>;
}): Promise<void> {
  const admin = getServerSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.from("security_audit_events").insert({
      event_type: input.eventType,
      metadata: input.metadata ?? {},
      user_id: input.userId,
    });
  } catch {
    // Audit availability must not expose or alter the primary operation response.
  }
}
