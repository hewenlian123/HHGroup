import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  estimateActivityActorFromAuth,
  formatEstimateActivityEvent,
  linkEstimateMilestoneInvoiceWithActivityWithClient,
  recordEstimateCreatedActivityWithClient,
  transitionEstimateStatusWithActivityWithClient,
  type EstimateActivityEvent,
} from "@/lib/estimate-activity";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260822233000_estimate_activity_timeline.sql"
);
const DETAIL_PAGE = path.join(process.cwd(), "src/app/estimates/[id]/page.tsx");
const DETAIL_CLIENT = path.join(process.cwd(), "src/app/estimates/[id]/estimate-detail-client.tsx");

const ACTOR = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "owner@example.com",
};

describe("Estimate Phase 3C activity contract", () => {
  it("snapshots the authenticated actor without trusting a client-supplied name", () => {
    expect(
      estimateActivityActorFromAuth({
        email: " Owner@Example.com ",
        role: "owner",
        user: { id: ACTOR.userId },
      })
    ).toEqual(ACTOR);
  });

  it("records Estimate Created through the protected RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await recordEstimateCreatedActivityWithClient(
      { rpc } as never,
      "22222222-2222-4222-8222-222222222222",
      ACTOR
    );

    expect(rpc).toHaveBeenCalledWith("record_estimate_created_activity", {
      p_estimate_id: "22222222-2222-4222-8222-222222222222",
      p_actor_user_id: ACTOR.userId,
      p_actor_label: ACTOR.label,
      p_creation_method: "new",
      p_source_estimate_id: null,
    });
  });

  it("transitions lifecycle state and writes its event in one RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    const changed = await transitionEstimateStatusWithActivityWithClient(
      { rpc } as never,
      "22222222-2222-4222-8222-222222222222",
      "Approved",
      ACTOR
    );

    expect(changed).toBe(true);
    expect(rpc).toHaveBeenCalledWith("transition_estimate_status_with_activity", {
      p_estimate_id: "22222222-2222-4222-8222-222222222222",
      p_next_status: "Approved",
      p_actor_user_id: ACTOR.userId,
      p_actor_label: ACTOR.label,
      p_related_record_id: null,
      p_related_record_type: null,
    });
  });

  it("links a milestone invoice and writes Draft Invoice Created atomically", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          linked_invoice_id: "55555555-5555-4555-8555-555555555555",
          linked: true,
        },
      ],
      error: null,
    });

    const result = await linkEstimateMilestoneInvoiceWithActivityWithClient({ rpc } as never, {
      estimateId: "22222222-2222-4222-8222-222222222222",
      scheduleItemId: "44444444-4444-4444-8444-444444444444",
      invoiceId: "55555555-5555-4555-8555-555555555555",
      actor: ACTOR,
    });

    expect(result).toEqual({
      invoiceId: "55555555-5555-4555-8555-555555555555",
      linked: true,
    });
    expect(rpc).toHaveBeenCalledWith("link_estimate_milestone_invoice_with_activity", {
      p_estimate_id: "22222222-2222-4222-8222-222222222222",
      p_schedule_item_id: "44444444-4444-4444-8444-444444444444",
      p_invoice_id: "55555555-5555-4555-8555-555555555555",
      p_actor_user_id: ACTOR.userId,
      p_actor_label: ACTOR.label,
    });
  });

  it("formats revision-aware related links from canonical IDs", () => {
    const event: EstimateActivityEvent = {
      id: "event-1",
      estimateId: "22222222-2222-4222-8222-222222222222",
      revisionRootId: "11111111-1111-4111-8111-111111111111",
      revisionNumber: 0,
      eventType: "revision_created",
      actorUserId: ACTOR.userId,
      actorLabel: ACTOR.label,
      occurredAt: "2026-08-22T10:00:00.000Z",
      relatedRecordType: "estimate_revision",
      relatedRecordId: "33333333-3333-4333-8333-333333333333",
      metadata: { related_revision_number: 1 },
    };

    expect(formatEstimateActivityEvent(event)).toEqual({
      title: "Revision Created",
      detail: "Rev 1 created from Rev 0",
      relatedHref: "/estimates/33333333-3333-4333-8333-333333333333",
      relatedLabel: "Open Rev 1",
    });
  });

  it("defines protected append-only storage and atomic business-operation hooks", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");

    expect(sql).toMatch(/create table public\.estimate_activity_events/i);
    expect(sql).toMatch(/revision_root_id uuid not null/i);
    expect(sql).toMatch(/revision_number integer not null/i);
    expect(sql).toMatch(/actor_user_id uuid not null/i);
    expect(sql).toMatch(/actor_label text not null/i);
    expect(sql).toMatch(/related_record_type text/i);
    expect(sql).toMatch(/related_record_id uuid/i);
    expect(sql).toMatch(/alter table public\.estimate_activity_events enable row level security/i);
    expect(sql).toMatch(/revoke all privileges[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select, insert[\s\S]*to service_role/i);
    expect(sql).toMatch(/prevent_estimate_activity_event_update/i);
    expect(sql).toMatch(/transition_estimate_status_with_activity/i);
    expect(sql).toMatch(/link_estimate_milestone_invoice_with_activity/i);
    expect(sql).toMatch(/duplicate_estimate_as_draft\([\s\S]*p_actor_user_id uuid/i);
    expect(sql).toMatch(/create_estimate_revision\([\s\S]*p_actor_user_id uuid/i);
    expect(sql).toMatch(/'revision_created'/i);
    expect(sql).toMatch(/'draft_invoice_created'/i);
    expect(sql).toMatch(/'converted_to_project'/i);
  });

  it("loads and renders a compact read-only Activity section", () => {
    const page = fs.readFileSync(DETAIL_PAGE, "utf8");
    const client = fs.readFileSync(DETAIL_CLIENT, "utf8");

    expect(page).toContain("getEstimateActivity");
    expect(client).toContain("EstimateActivityTimeline");
    expect(client).toContain("activityEvents");
  });
});
