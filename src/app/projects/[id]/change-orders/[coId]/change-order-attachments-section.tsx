"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2 } from "lucide-react";
import { SectionHeader, Divider } from "@/components/base";
import { Button } from "@/components/ui/button";
import { addChangeOrderAttachmentAction, deleteChangeOrderAttachmentAction } from "../actions";
import type { ChangeOrderAttachment } from "@/lib/data";

export function ChangeOrderAttachmentsSection({
  changeOrderId,
  projectId,
  attachments,
  readOnly,
}: {
  changeOrderId: string;
  projectId: string;
  attachments: ChangeOrderAttachment[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const input = form.querySelector('input[type="file"]') as HTMLInputElement;
    if (!input?.files?.length) {
      setError("Select a file.");
      return;
    }
    const formData = new FormData();
    formData.set("file", input.files[0]);
    startTransition(async () => {
      const result = await addChangeOrderAttachmentAction(changeOrderId, projectId, formData);
      if (result.ok) {
        void syncRouterAndClients(router);
        input.value = "";
      } else {
        setError(result.error ?? "Upload failed.");
      }
    });
  };

  const handleDelete = (attachmentId: string) => {
    startTransition(async () => {
      const { ok } = await deleteChangeOrderAttachmentAction(attachmentId, projectId, changeOrderId);
      if (ok) void syncRouterAndClients(router);
    });
  };

  return (
    <>
      <SectionHeader label="Attachments" />
      <Divider />
      {attachments.length === 0 && readOnly ? (
        <p className="py-4 text-sm text-muted-foreground">No attachments.</p>
      ) : (
        <ul className="space-y-2 py-2">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center justify-between gap-2 rounded border border-border/60 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 truncate">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{att.fileName}</span>
                <span className="text-muted-foreground">
                  {att.sizeBytes > 0 ? ` (${(att.sizeBytes / 1024).toFixed(1)} KB)` : ""}
                </span>
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(att.id)}
                  disabled={pending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form onSubmit={handleUpload} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            className="max-w-[220px] text-sm file:mr-2 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            disabled={pending}
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </form>
      )}
    </>
  );
}
