"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createQuickExpense } from "@/lib/data";
import { createBrowserClient } from "@/lib/supabase";
import { Camera, Upload } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";

type ReceiptOcrResult = {
  vendor_name: string;
  total_amount: number;
  purchase_date: string;
  items?: Array<{ name?: string; amount?: number }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function QuickExpenseModal({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!supabase) {
      setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      toast({ title: "Configuration required", description: "Supabase must be configured to upload and save expenses.", variant: "error" });
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_") || "receipt.jpg";
      const path = `receipts/${timestamp}-${safeName}`;

      const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
      const receiptUrl = urlData.publicUrl;

      let ocr: ReceiptOcrResult = {
        vendor_name: "Unknown",
        total_amount: 0,
        purchase_date: new Date().toISOString().slice(0, 10),
      };
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/ocr-receipt", { method: "POST", body: form });
        if (res.ok) {
          ocr = await res.json();
        }
      } catch {
        // use fallback
      }

      const date = ocr.purchase_date || new Date().toISOString().slice(0, 10);
      const vendorName = (ocr.vendor_name || "Unknown").trim();
      const totalAmount = Number(ocr.total_amount) || 0;

      await createQuickExpense({
        date,
        vendorName,
        totalAmount,
        receiptUrl,
      });

      toast({ title: "Quick expense created", description: `${vendorName} — $${totalAmount.toLocaleString()}`, variant: "success" });
      onSuccess();
      onOpenChange(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed.";
      setError(msg);
      toast({ title: "Failed", description: msg, variant: "error" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/60 sm:max-w-md">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="text-base font-medium">Quick Expense Upload</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!supabase ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Supabase is not configured. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to upload receipts and save expenses to your database.
            </p>
          ) : (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Receipt Photo</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-12 flex-1 text-base sm:h-11"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="mr-2 h-5 w-5" />
                Take Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-12 flex-1 text-base sm:h-11"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 h-5 w-5" />
                Upload File
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Use camera or choose an image. OCR will extract vendor and amount.</p>
          </div>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {uploading ? <p className="text-sm text-muted-foreground">Uploading and creating expense…</p> : null}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
