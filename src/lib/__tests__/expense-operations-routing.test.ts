import { describe, expect, it } from "vitest";

import {
  normalizeWorkerReceiptStatusFilter,
  workerReceiptInboxPath,
} from "@/lib/expense-operations-routing";

describe("Expense Operations routing", () => {
  it("maps the legacy Worker Receipts route to the Worker Submitted Inbox view", () => {
    expect(
      workerReceiptInboxPath({
        project_id: "project-a",
        workerId: "worker-a",
        status: "pending",
        date_from: "2026-08-01",
        date_to: "2026-08-15",
      })
    ).toBe(
      "/financial/inbox/worker?project_id=project-a&workerId=worker-a&status=pending&date_from=2026-08-01&date_to=2026-08-15"
    );
  });

  it("preserves only semantically supported Worker Receipt filters", () => {
    expect(
      workerReceiptInboxPath({
        project_id: ["project-a", "project-b"],
        workerId: " worker-a ",
        status: "Approved",
        date_kind: "all",
        search: "secret",
        ops_record: "record-a",
      })
    ).toBe("/financial/inbox/worker?project_id=project-a&workerId=worker-a&status=Approved");
  });

  it("normalizes supported status filters without inventing a status", () => {
    expect(normalizeWorkerReceiptStatusFilter("pending")).toBe("Pending");
    expect(normalizeWorkerReceiptStatusFilter("APPROVED")).toBe("Approved");
    expect(normalizeWorkerReceiptStatusFilter("paid")).toBe("Paid");
    expect(normalizeWorkerReceiptStatusFilter("needs_review")).toBe("");
  });
});
