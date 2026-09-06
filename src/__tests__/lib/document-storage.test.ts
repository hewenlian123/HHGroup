import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadDocumentFile } from "@/lib/document-storage";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: () => null }));

function database(uploadFails = false, cleanupFails = false) {
  const events: string[] = [];
  let metadata: Record<string, unknown> | undefined;
  const client = {
    from(table: string) {
      if (table === "projects")
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { organization_id: "org-a" }, error: null }),
            }),
          }),
        };
      return {
        insert(value: Record<string, unknown>) {
          metadata = value;
          events.push("metadata");
          return { select: () => ({ single: async () => ({ data: value, error: null }) }) };
        },
        delete() {
          return {
            eq: () => ({
              select: async () => {
                events.push("delete metadata");
                return { data: [{ id: metadata?.id }], error: null };
              },
            }),
          };
        },
      };
    },
    storage: {
      from: () => ({
        upload: async () => {
          events.push("upload");
          return { error: uploadFails ? { message: "upload failed" } : null };
        },
        remove: async () => {
          events.push("delete object");
          return { error: cleanupFails ? { message: "cleanup failed" } : null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, events, metadata: () => metadata };
}
const draft = { file_name: "plan.pdf", project_id: "project-a", mime_type: "application/pdf" };
describe("document upload lifecycle", () => {
  it("reserves exact project metadata before uploading its private object", async () => {
    const db = database();
    const result = await uploadDocumentFile(db.client, draft, new ArrayBuffer(1));
    expect(db.events).toEqual(["metadata", "upload"]);
    expect(result.file_path).toBe(
      `organizations/org-a/projects/project-a/documents/${result.id}/plan.pdf`
    );
    expect(db.metadata()?.organization_id).toBe("org-a");
  });
  it("cleans the exact object before metadata when upload fails", async () => {
    const db = database(true);
    await expect(uploadDocumentFile(db.client, draft, new ArrayBuffer(1))).rejects.toThrow(
      "upload failed"
    );
    expect(db.events).toEqual(["metadata", "upload", "delete object", "delete metadata"]);
  });
  it("retains the association and reports failed object cleanup", async () => {
    const db = database(true, true);
    await expect(uploadDocumentFile(db.client, draft, new ArrayBuffer(1))).rejects.toThrow(
      /cleanup/i
    );
    expect(db.events).toEqual(["metadata", "upload", "delete object"]);
  });
});
