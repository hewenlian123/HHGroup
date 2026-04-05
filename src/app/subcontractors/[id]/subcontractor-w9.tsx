"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { uploadW9, removeW9, getW9SignedUrl } from "./actions";

export function SubcontractorW9({
  subcontractorId,
  w9StoragePath,
}: {
  subcontractorId: string;
  w9StoragePath: string | null;
}) {
  const router = useRouter();
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleUpload = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      setMessage(null);
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadW9(subcontractorId, formData);
      if (result.ok) {
        void syncRouterAndClients(router);
      } else {
        setMessage(result.error ?? "Upload failed.");
      }
      setUploading(false);
      e.target.value = "";
    },
    [subcontractorId, router]
  );

  const handleView = React.useCallback(async () => {
    if (!w9StoragePath) return;
    setMessage(null);
    const result = await getW9SignedUrl(w9StoragePath);
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      setMessage(result.error ?? "Could not open file.");
    }
  }, [w9StoragePath]);

  const handleRemove = React.useCallback(async () => {
    if (!w9StoragePath || !confirm("Remove W9 document?")) return;
    setMessage(null);
    const result = await removeW9(subcontractorId, w9StoragePath);
    if (result.ok) {
      void syncRouterAndClients(router);
    } else {
      setMessage(result.error ?? "Failed to remove.");
    }
  }, [subcontractorId, w9StoragePath, router]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />
      {w9StoragePath ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={handleView}>
            View W9
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={uploading}
            className="btn-outline-ghost"
          >
            Remove
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "Upload W9"}
        </Button>
      )}
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}
