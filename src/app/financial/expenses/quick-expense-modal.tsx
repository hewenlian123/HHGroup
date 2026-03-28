"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addExpenseAttachment,
  createQuickExpense,
  getExpenseTotal,
  type Expense,
} from "@/lib/data";
import { createBrowserClient } from "@/lib/supabase";
import { Camera, Loader2, Upload } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { AmountDiagnosticsPanel } from "@/components/ocr/amount-diagnostics-panel";
import {
  type AmountRuleDiagnostic,
  type FieldConfidence,
  type OcrSource,
  type ReceiptOcrResult,
  mergeReceiptOcrResults,
  runReceiptOcrForImageFile,
} from "@/lib/receipt-ocr-client";

type BrowserSupabase = NonNullable<ReturnType<typeof createBrowserClient>>;

type QuickExpenseAttachmentSlot = {
  previewUrl: string;
  attachmentPath: string | null;
  receiptsPublicUrl: string | null;
  uploadError?: string;
  revoke?: () => void;
  pendingFile?: File;
};

async function uploadReceiptToStorage(
  supabase: BrowserSupabase,
  file: File,
  keySuffix: string
): Promise<QuickExpenseAttachmentSlot> {
  // Prefer server upload to avoid browser-side bucket policy/session issues.
  try {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/quick-expense/upload-attachment", {
      method: "POST",
      body: fd,
    });
    if (res.ok) {
      const payload = (await res.json()) as {
        ok: boolean;
        path?: string;
        signed_url?: string;
        public_url?: string;
      };
      if (payload.ok && payload.path) {
        const fallbackBlob =
          !payload.signed_url && !payload.public_url ? URL.createObjectURL(file) : null;
        return {
          previewUrl: payload.signed_url || payload.public_url || fallbackBlob || "",
          attachmentPath: payload.path,
          receiptsPublicUrl: payload.public_url ?? null,
          revoke: fallbackBlob ? () => URL.revokeObjectURL(fallbackBlob) : undefined,
        };
      }
    }
  } catch {
    // fall through to legacy browser upload path
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_") || "receipt.jpg";
  const expPath = `quick-expense/${Date.now()}-${keySuffix}-${safeName}`;
  const { error: expErr } = await supabase.storage
    .from("expense-attachments")
    .upload(expPath, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
  if (!expErr) {
    const { data: signed } = await supabase.storage
      .from("expense-attachments")
      .createSignedUrl(expPath, 60 * 60 * 6);
    if (signed?.signedUrl) {
      return {
        previewUrl: signed.signedUrl,
        attachmentPath: expPath,
        receiptsPublicUrl: null,
      };
    }
    const blob = URL.createObjectURL(file);
    return {
      previewUrl: blob,
      attachmentPath: expPath,
      receiptsPublicUrl: null,
      revoke: () => URL.revokeObjectURL(blob),
    };
  }
  const rPath = `receipts/${Date.now()}-${keySuffix}-${safeName}`;
  const { error: recErr } = await supabase.storage.from("receipts").upload(rPath, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (!recErr) {
    const { data: pub } = supabase.storage.from("receipts").getPublicUrl(rPath);
    const u = pub.publicUrl;
    return { previewUrl: u, attachmentPath: null, receiptsPublicUrl: u };
  }
  const blob = URL.createObjectURL(file);
  return {
    previewUrl: blob,
    attachmentPath: null,
    receiptsPublicUrl: null,
    revoke: () => URL.revokeObjectURL(blob),
    pendingFile: file,
    uploadError: "Upload to Supabase Storage failed (bucket/policy/session).",
  };
}

type OcrDebugInfo = {
  source: OcrSource;
  fallbackTriggered: boolean;
  cloud: Array<{ status?: string; reason?: string; confidence?: unknown }>;
  rawText: string;
  parsed: { vendor: string; amount: number; date: string };
  parsedItems: string[];
  matchedRules: string[];
  amountDiagnostics: AmountRuleDiagnostic[];
  confidence: { vendor: FieldConfidence; amount: FieldConfidence; date: FieldConfidence };
};

const ITEM_CATALOG = [
  "Paint",
  "Lumber",
  "Concrete",
  "Plumbing",
  "Electrical",
  "Materials",
] as const;

function titleCase(v: string): string {
  return (v || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function dedupeItems(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const item = titleCase(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeVendor(v: string): string {
  return (v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projects: Array<{ id: string; name: string | null; status?: string | null }>;
  expenses: Expense[];
};

export function QuickExpenseModal({ open, onOpenChange, onSuccess, projects, expenses }: Props) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<"upload" | "edit">("upload");
  const [attachmentSlots, setAttachmentSlots] = React.useState<QuickExpenseAttachmentSlot[]>([]);
  const [attachmentLightbox, setAttachmentLightbox] = React.useState<string | null>(null);
  const [vendorName, setVendorName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = React.useState("Other");
  const [notes, setNotes] = React.useState("");
  const [projectSearch, setProjectSearch] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  const [ocrSource, setOcrSource] = React.useState<OcrSource>("none");
  const [recognizedItems, setRecognizedItems] = React.useState<string[]>([]);
  const [itemDraft, setItemDraft] = React.useState("");
  const [fieldConfidence, setFieldConfidence] = React.useState<{
    vendor: FieldConfidence;
    amount: FieldConfidence;
    date: FieldConfidence;
  }>({ vendor: "low", amount: "low", date: "low" });
  const [detectedSnapshot, setDetectedSnapshot] = React.useState<{
    vendor: string;
    amount: number;
  } | null>(null);
  const [debugUnlocked, setDebugUnlocked] = React.useState(false);
  const [debugOpen, setDebugOpen] = React.useState(false);
  const [debugData, setDebugData] = React.useState<OcrDebugInfo | null>(null);
  const [duplicateConfirmed, setDuplicateConfirmed] = React.useState(false);
  const [ocrSuggestions, setOcrSuggestions] = React.useState<{
    vendor: string;
    amount: string;
    date: string;
  } | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = React.useState<{
    id: string;
    vendor: string;
    date: string;
    amount: number;
  } | null>(null);
  const categories = ["Other", "Materials", "Vehicle", "Meals"];
  const LAST_PROJECT_KEY = "hh.quick-expense-last-project-id";
  const OCR_LEARN_KEY = "hh.quick-expense-ocr-learn";
  const OCR_HISTORY_KEY = "hh.quick-expense-ocr-history";
  const vendorInputRef = React.useRef<HTMLInputElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const inferCategory = React.useCallback((vendor: string, itemNames: string[] = []) => {
    const haystack = `${vendor} ${itemNames.join(" ")}`.toLowerCase();
    if (/home depot|lowe'?s|lowes/.test(haystack)) return "Materials";
    if (/gas|fuel|shell|chevron|exxon|mobil|bp/.test(haystack)) return "Vehicle";
    if (/restaurant|cafe|coffee|diner|bbq|burger|pizza/.test(haystack)) return "Meals";
    return "Other";
  }, []);

  const suggestedProjectId = React.useMemo(() => {
    const recent = [...expenses]
      .filter((e) => e.lines.some((l) => l.projectId))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 30);
    const counts = new Map<string, number>();
    for (const e of recent) {
      const pid = e.lines[0]?.projectId;
      if (!pid) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] ?? "";
  }, [expenses]);

  const assessImageQuality = React.useCallback(async (file: File): Promise<string | null> => {
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image load failed"));
        el.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      if (img.width < 700 || img.height < 700) return "Image quality is low, please retake.";
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(500, img.width);
      canvas.height = Math.max(1, Math.round((canvas.width / img.width) * img.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      let sumSq = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sum += lum;
        sumSq += lum * lum;
      }
      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      if (Math.sqrt(variance) < 28) return "Image quality is low, please retake.";
      return null;
    } catch {
      return null;
    }
  }, []);

  const enterFallbackEdit = React.useCallback(
    (msg?: string) => {
      setAttachmentSlots((prev) => {
        for (const s of prev) s.revoke?.();
        return [];
      });
      setDate(new Date().toISOString().slice(0, 10));
      setVendorName("Unknown");
      setAmount("");
      setCategory("Other");
      setOcrSuggestions(null);
      setStep("edit");
      if (msg) {
        setError(msg);
        toast({
          title: "OCR fallback",
          description: msg,
          variant: "default",
        });
      }
    },
    [toast]
  );

  const resetState = React.useCallback(() => {
    setProcessing(false);
    setSaving(false);
    setDragOver(false);
    setError(null);
    setStep("upload");
    setAttachmentSlots((prev) => {
      for (const s of prev) s.revoke?.();
      return [];
    });
    setAttachmentLightbox(null);
    setVendorName("");
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setCategory("Other");
    setNotes("");
    setProjectSearch("");
    setProjectId("");
    setOcrSource("none");
    setFieldConfidence({ vendor: "low", amount: "low", date: "low" });
    setDetectedSnapshot(null);
    setRecognizedItems([]);
    setItemDraft("");
    setDebugData(null);
    setDebugOpen(false);
    setDuplicateConfirmed(false);
    setDuplicateCandidate(null);
    setOcrSuggestions(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  React.useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  React.useEffect(() => {
    if (!open) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if ((params.get("debug") ?? "").toLowerCase() === "ocr") {
        setDebugUnlocked(true);
        setDebugOpen(true);
      }
    } catch {
      // ignore
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setDebugUnlocked(true);
        setDebugOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const projectOptions = React.useMemo(() => {
    const sorted = [...projects].sort((a, b) => {
      const aActive = (a.status ?? "").toLowerCase() === "active" ? 0 : 1;
      const bActive = (b.status ?? "").toLowerCase() === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    const q = projectSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (p) => (p.name ?? "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [projectSearch, projects]);

  React.useEffect(() => {
    if (step !== "edit") return;
    if (projectId) return;
    try {
      const last = window.localStorage.getItem(LAST_PROJECT_KEY) ?? "";
      if (last && projects.some((p) => p.id === last)) setProjectId(last);
      else if (suggestedProjectId) setProjectId(suggestedProjectId);
    } catch {
      // ignore
    }
  }, [step, projectId, projects, suggestedProjectId]);

  React.useEffect(() => {
    if (step !== "edit") return;
    const score = (v: FieldConfidence) => (v === "low" ? 0 : v === "medium" ? 1 : 2);
    const ranked = [
      { key: "amount", score: score(fieldConfidence.amount), ref: amountInputRef.current },
      { key: "vendor", score: score(fieldConfidence.vendor), ref: vendorInputRef.current },
      { key: "date", score: score(fieldConfidence.date), ref: dateInputRef.current },
    ].sort((a, b) => a.score - b.score);
    const target = ranked[0]?.ref;
    if (target) setTimeout(() => target.focus(), 0);
  }, [step, fieldConfidence]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    if (!supabase) {
      enterFallbackEdit("Storage is unavailable. Please enter expense details manually and save.");
      return;
    }
    setError(null);
    setProcessing(true);
    setOcrSource("none");
    try {
      const list = Array.from(files).slice(0, 5);
      const qualityWarning = await assessImageQuality(list[0]);
      if (qualityWarning) {
        toast({ title: "Image quality warning", description: qualityWarning, variant: "default" });
      }
      setAttachmentSlots((prev) => {
        for (const s of prev) s.revoke?.();
        return [];
      });
      const slots: QuickExpenseAttachmentSlot[] = [];
      for (let fi = 0; fi < list.length; fi++) {
        slots.push(await uploadReceiptToStorage(supabase, list[fi]!, String(fi)));
      }
      setAttachmentSlots(slots);

      const ocrResults: Array<{ result: ReceiptOcrResult; source: OcrSource }> = [];
      for (const file of list) {
        ocrResults.push(await runReceiptOcrForImageFile(file, { localTimeoutMs: 8000 }));
      }

      const merged = mergeReceiptOcrResults(ocrResults, {
        learnStorageKey: OCR_LEARN_KEY,
        inferCategory,
      });

      setDate(
        merged.autoFillDate && merged.clampedPurchase ? merged.clampedPurchase : merged.todayStr
      );
      setVendorName(merged.autoFillVendor ? merged.finalVendor : "");
      setAmount(
        merged.autoFillAmount && merged.sanitizedAmount != null
          ? String(merged.sanitizedAmount)
          : ""
      );
      setCategory(merged.mappedCategory);
      setFieldConfidence({
        vendor: merged.vendorConfidence,
        amount: merged.amountConfidence,
        date: merged.dateConfidence,
      });
      setDetectedSnapshot(merged.detectedSnapshot);
      setRecognizedItems(merged.finalItems);
      setOcrSource(merged.source);
      setOcrSuggestions(merged.ocrSuggestions);
      setStep("edit");
      setDebugData({
        source: merged.source,
        fallbackTriggered: merged.source !== "cloud",
        cloud: merged.ocrResults.map((r) => ({
          status: r.result.ocr_status,
          reason: r.result.ocr_reason,
          confidence: r.result.confidence,
        })),
        rawText: merged.mergedText,
        parsed: {
          vendor: merged.finalVendor,
          amount: merged.sanitizedAmount ?? 0,
          date: merged.finalDateSuggestion,
        },
        parsedItems: merged.finalItems,
        matchedRules: merged.matchedRules,
        amountDiagnostics: merged.amountDiagnostics,
        confidence: {
          vendor: merged.vendorConfidence,
          amount: merged.amountConfidence,
          date: merged.dateConfidence,
        },
      });

      if (
        merged.vendorConfidence !== "high" ||
        merged.amountConfidence !== "high" ||
        merged.dateConfidence !== "high"
      ) {
        toast({
          title: "OCR suggestions",
          description:
            "Only high-confidence fields were auto-filled. Review yellow hints and the suggestion box before saving.",
          variant: "default",
        });
      }
      setDuplicateConfirmed(false);
      setDuplicateCandidate(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed.";
      enterFallbackEdit(msg);
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (saving || processing) return;
    const totalAmount = Number(amount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }
    const sameDay = expenses.filter(
      (e) => (e.date ?? "") === (date || new Date().toISOString().slice(0, 10))
    );
    const dup = sameDay.find((e) => {
      const sameVendor = normalizeVendor(e.vendorName ?? "") === normalizeVendor(vendorName ?? "");
      const closeAmount = Math.abs(getExpenseTotal(e) - totalAmount) < 0.01;
      return sameVendor && closeAmount;
    });
    if (dup && !duplicateConfirmed) {
      setDuplicateConfirmed(true);
      setDuplicateCandidate({
        id: dup.id,
        vendor: dup.vendorName ?? "Unknown",
        date: dup.date ?? "",
        amount: getExpenseTotal(dup),
      });
      toast({
        title: "This receipt may already exist",
        description: "Same vendor/date/amount found. Click Save again to continue.",
        variant: "default",
      });
      return;
    }
    setDuplicateCandidate(null);
    setSaving(true);
    setError(null);
    try {
      let slotsToSave = attachmentSlots;
      if (supabase) {
        slotsToSave = await Promise.all(
          attachmentSlots.map(async (s, i) => {
            if (s.pendingFile && !s.attachmentPath && !s.receiptsPublicUrl) {
              const u = await uploadReceiptToStorage(supabase, s.pendingFile, `save-${i}`);
              return { ...u, pendingFile: undefined };
            }
            return s;
          })
        );
        setAttachmentSlots(slotsToSave);
      }
      const firstPublic = slotsToSave.find((s) => s.receiptsPublicUrl)?.receiptsPublicUrl ?? "";
      const hasStoragePath = slotsToSave.some((s) => s.attachmentPath);

      const created = await createQuickExpense({
        date: date || new Date().toISOString().slice(0, 10),
        vendorName: vendorName.trim() || "Unknown",
        totalAmount,
        receiptUrl: firstPublic,
        category,
        notes: (() => {
          const userNotes = notes.trim();
          const itemsPart = `Items: ${dedupeItems(recognizedItems).join(", ")}`;
          if (!itemsPart || dedupeItems(recognizedItems).length === 0)
            return userNotes || undefined;
          return userNotes ? `${userNotes}\n${itemsPart}` : itemsPart;
        })(),
        projectId: projectId || null,
      });
      for (const s of slotsToSave) {
        if (s.attachmentPath) {
          await addExpenseAttachment(created.id, {
            id: crypto.randomUUID(),
            fileName: "receipt",
            mimeType: "image/jpeg",
            size: 0,
            url: s.attachmentPath,
            createdAt: new Date().toISOString(),
          });
        }
      }
      toast({
        title: "Expense saved",
        description: `${vendorName.trim() || "Unknown"} — $${totalAmount.toLocaleString()}`,
        variant: "success",
      });
      if (slotsToSave.length === 0 || (!firstPublic && !hasStoragePath)) {
        toast({
          title: "Saved without usable receipt attachment",
          description:
            slotsToSave.length === 0
              ? "No receipt files were linked to this expense."
              : "Images could not be stored in Supabase (check buckets/policies). Add receipts from the expense detail page if needed.",
          variant: "default",
        });
      }
      try {
        if (detectedSnapshot) {
          const changedVendor =
            normalizeVendor(vendorName) !== normalizeVendor(detectedSnapshot.vendor);
          const changedAmount = Math.abs(totalAmount - detectedSnapshot.amount) >= 0.01;
          if (changedVendor || changedAmount) {
            const raw = window.localStorage.getItem(OCR_LEARN_KEY);
            const learned = raw
              ? (JSON.parse(raw) as {
                  vendorAliases?: Record<string, string>;
                  amountHints?: Record<string, number>;
                })
              : {};
            const key = normalizeVendor(detectedSnapshot.vendor);
            if (changedVendor) {
              learned.vendorAliases = learned.vendorAliases ?? {};
              learned.vendorAliases[key] = vendorName.trim() || detectedSnapshot.vendor;
            }
            if (changedAmount) {
              learned.amountHints = learned.amountHints ?? {};
              learned.amountHints[key] = totalAmount;
            }
            window.localStorage.setItem(OCR_LEARN_KEY, JSON.stringify(learned));
          }
        }
        if (projectId) window.localStorage.setItem(LAST_PROJECT_KEY, projectId);
        const historyRaw = window.localStorage.getItem(OCR_HISTORY_KEY);
        const history = historyRaw ? (JSON.parse(historyRaw) as unknown[]) : [];
        const entry = {
          at: new Date().toISOString(),
          source: ocrSource,
          raw_text: debugData?.rawText ?? "",
          parsed_result: {
            vendor: vendorName.trim() || "Unknown",
            amount: totalAmount,
            date: date || new Date().toISOString().slice(0, 10),
            items: dedupeItems(recognizedItems),
            category,
            projectId: projectId || null,
          },
        };
        window.localStorage.setItem(
          OCR_HISTORY_KEY,
          JSON.stringify([entry, ...history].slice(0, 50))
        );
      } catch {
        // ignore
      }
      await onSuccess();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save expense.";
      setError(msg);
      toast({ title: "Save failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-[100dvh] w-full max-w-none overflow-y-auto rounded-none border-border/60 sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-sm">
          <DialogHeader className="border-b border-border/60 pb-3">
            <DialogTitle className="text-base font-medium">Quick Expense Upload</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!supabase ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Supabase is not configured. Configure NEXT_PUBLIC_SUPABASE_URL and
                NEXT_PUBLIC_SUPABASE_ANON_KEY to upload receipts and save expenses to your database.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  Receipt Photo
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleFiles(e.target.files);
                  }}
                />
                {step === "upload" ? (
                  <div
                    className={`rounded border border-dashed p-4 transition-colors ${
                      dragOver ? "border-primary" : "border-border/60"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      void handleFiles(e.dataTransfer.files);
                    }}
                  >
                    <p className="text-sm text-muted-foreground mb-3">
                      Drag and drop receipt images here, or use buttons below.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-12 flex-1 text-base sm:h-11"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={processing}
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
                        disabled={processing}
                      >
                        <Upload className="mr-2 h-5 w-5" />
                        Upload File(s)
                      </Button>
                    </div>
                  </div>
                ) : null}
                {step === "edit" ? (
                  <div className="space-y-3">
                    {ocrSuggestions &&
                    (fieldConfidence.vendor !== "high" ||
                      fieldConfidence.amount !== "high" ||
                      fieldConfidence.date !== "high") ? (
                      <div className="rounded-sm border border-amber-500/45 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                        <p className="font-medium text-amber-900 dark:text-amber-50">
                          OCR suggestions (verify before save)
                        </p>
                        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-amber-900/90 dark:text-amber-100/90">
                          {fieldConfidence.vendor !== "high" && ocrSuggestions.vendor ? (
                            <li>Vendor: {ocrSuggestions.vendor}</li>
                          ) : null}
                          {fieldConfidence.amount !== "high" && ocrSuggestions.amount ? (
                            <li>Amount: {ocrSuggestions.amount}</li>
                          ) : null}
                          {fieldConfidence.date !== "high" && ocrSuggestions.date ? (
                            <li>Date: {ocrSuggestions.date}</li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Vendor
                      </label>
                      <Input
                        ref={vendorInputRef}
                        value={vendorName}
                        onChange={(e) => setVendorName(e.target.value)}
                        className={`mt-1 h-9 ${fieldConfidence.vendor !== "high" ? "border-amber-500/55" : ""}`}
                        disabled={saving}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Confidence: {fieldConfidence.vendor}
                        {fieldConfidence.vendor !== "high" && ocrSuggestions?.vendor ? (
                          <span className="text-amber-700 dark:text-amber-300">
                            {" "}
                            · suggested: {ocrSuggestions.vendor}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Amount
                        </label>
                        <Input
                          ref={amountInputRef}
                          type="number"
                          min="0"
                          step="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className={`mt-1 h-9 ${fieldConfidence.amount !== "high" ? "border-amber-500/55" : ""}`}
                          disabled={saving}
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Confidence: {fieldConfidence.amount}
                          {fieldConfidence.amount !== "high" && ocrSuggestions?.amount ? (
                            <span className="text-amber-700 dark:text-amber-300">
                              {" "}
                              · suggested: {ocrSuggestions.amount}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Date
                        </label>
                        <Input
                          ref={dateInputRef}
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className={`mt-1 h-9 ${fieldConfidence.date !== "high" ? "border-amber-500/55" : ""}`}
                          disabled={saving}
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Confidence: {fieldConfidence.date}
                          {fieldConfidence.date !== "high" && ocrSuggestions?.date ? (
                            <span className="text-amber-700 dark:text-amber-300">
                              {" "}
                              · suggested: {ocrSuggestions.date}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Items
                      </label>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {dedupeItems(recognizedItems).map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1 rounded-sm border border-border/60 px-2 py-1 text-xs"
                          >
                            {item}
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setRecognizedItems((prev) =>
                                  prev.filter((p) => p.toLowerCase() !== item.toLowerCase())
                                )
                              }
                              disabled={saving}
                              aria-label={`Remove ${item}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          value={itemDraft}
                          onChange={(e) => setItemDraft(e.target.value)}
                          className="h-9"
                          placeholder="Add item"
                          disabled={saving}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9"
                          disabled={saving}
                          onClick={() => {
                            const next = titleCase(itemDraft);
                            if (!next) return;
                            setRecognizedItems((prev) => dedupeItems([...prev, next]));
                            setItemDraft("");
                          }}
                        >
                          Add
                        </Button>
                      </div>
                      <div className="mt-2">
                        <select
                          className="h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
                          value=""
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            setRecognizedItems((prev) => dedupeItems([...prev, v]));
                          }}
                          disabled={saving}
                        >
                          <option value="">Add from common items...</option>
                          {ITEM_CATALOG.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Project (Optional)
                      </label>
                      <Input
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="mt-1 h-9"
                        placeholder="Search project..."
                        disabled={saving}
                      />
                      <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className="mt-2 h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
                        disabled={saving}
                      >
                        <option value="">No project</option>
                        {projectOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name ?? p.id}
                          </option>
                        ))}
                      </select>
                      {projectId && projectId === suggestedProjectId ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Suggested from recent activity.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Category (Optional)
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
                        disabled={saving}
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Notes
                      </label>
                      <Input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="mt-1 h-9"
                        placeholder="Optional"
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Attachments
                      </label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {attachmentSlots.length} file(s) ready
                        {attachmentSlots.some(
                          (s) => s.pendingFile && !s.attachmentPath && !s.receiptsPublicUrl
                        )
                          ? " — storage upload failed (local preview only; will retry on save)"
                          : ""}
                      </p>
                      {attachmentSlots.some((s) => s.uploadError) ? (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                          {attachmentSlots.find((s) => s.uploadError)?.uploadError}
                        </p>
                      ) : null}
                      {attachmentSlots.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {attachmentSlots.map((s, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="relative overflow-hidden rounded-sm border border-border/60 focus:outline-none focus:ring-1 focus:ring-ring"
                              onClick={() => setAttachmentLightbox(s.previewUrl)}
                              disabled={saving}
                              aria-label={`View attachment ${idx + 1}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- preview URL is blob/signed */}
                              <img
                                src={s.previewUrl}
                                alt=""
                                className="h-14 w-14 object-cover"
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {attachmentSlots.length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 px-2 text-xs"
                          disabled={saving}
                          onClick={() =>
                            setAttachmentLightbox(attachmentSlots[0]?.previewUrl ?? null)
                          }
                        >
                          View attachment
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      {duplicateCandidate ? (
                        <div className="mr-auto flex items-center gap-2 rounded-sm border border-amber-500/40 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                          <span>
                            Possible duplicate: {duplicateCandidate.vendor} ·{" "}
                            {duplicateCandidate.date} · $
                            {duplicateCandidate.amount.toLocaleString()}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            asChild
                          >
                            <a
                              href={`/financial/expenses/${duplicateCandidate.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View existing
                            </a>
                          </Button>
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setStep("upload")}
                        disabled={saving}
                      >
                        Back
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        onClick={() => void handleSave()}
                        disabled={saving}
                      >
                        {saving ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                            Saving...
                          </>
                        ) : (
                          "Save"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  High-confidence OCR values are applied automatically; others appear as amber
                  hints. You can edit everything before save.
                </p>
                {process.env.NODE_ENV !== "production" && ocrSource !== "none" ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      OCR source:{" "}
                      {ocrSource === "cloud"
                        ? "Cloud OCR"
                        : ocrSource === "local"
                          ? "Local browser OCR fallback"
                          : "Manual fallback"}
                    </p>
                    {debugUnlocked ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setDebugOpen(true)}
                      >
                        Debug OCR
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {processing ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!attachmentLightbox}
        onOpenChange={(open) => {
          if (!open) setAttachmentLightbox(null);
        }}
      >
        <DialogContent className="max-w-lg border-border/60 p-0 gap-0 overflow-hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-2">
            <DialogTitle className="text-sm font-medium">Receipt preview</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-auto p-4">
            {attachmentLightbox ? (
              /* eslint-disable-next-line @next/next/no-img-element -- dynamic preview URL */
              <img src={attachmentLightbox} alt="" className="max-h-[70vh] w-full object-contain" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
        <DialogContent className="max-w-2xl border-border/60">
          <DialogHeader className="border-b border-border/60 pb-2">
            <DialogTitle className="text-base font-medium">OCR Debug Panel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="text-xs text-muted-foreground">
              Hidden tool mode: `Cmd/Ctrl + Shift + D` or `?debug=ocr`
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Source: {debugData?.source ?? "n/a"}</div>
              <div>Fallback: {debugData?.fallbackTriggered ? "yes" : "no"}</div>
            </div>
            <div className="text-sm">
              Status/Reason:{" "}
              {(debugData?.cloud ?? [])
                .map((c) => `${c.status ?? "n/a"}${c.reason ? ` (${c.reason})` : ""}`)
                .join(" | ")}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Parsed JSON
              </div>
              <pre className="max-h-40 overflow-auto rounded-sm border border-border/60 p-2 text-xs">
                {JSON.stringify(debugData?.parsed ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Parsed Items
              </div>
              <pre className="max-h-28 overflow-auto rounded-sm border border-border/60 p-2 text-xs">
                {JSON.stringify(debugData?.parsedItems ?? [], null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Matched Rules
              </div>
              <pre className="max-h-28 overflow-auto rounded-sm border border-border/60 p-2 text-xs">
                {JSON.stringify(debugData?.matchedRules ?? [], null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount Diagnostics
              </div>
              <AmountDiagnosticsPanel
                diagnostics={debugData?.amountDiagnostics ?? []}
                matchedRules={debugData?.matchedRules ?? []}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Confidence
              </div>
              <pre className="max-h-28 overflow-auto rounded-sm border border-border/60 p-2 text-xs">
                {JSON.stringify(debugData?.confidence ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Raw OCR Text
              </div>
              <pre className="max-h-48 overflow-auto rounded-sm border border-border/60 p-2 text-xs whitespace-pre-wrap">
                {debugData?.rawText ?? ""}
              </pre>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={async () => {
                  const payload = JSON.stringify(debugData ?? {}, null, 2);
                  await navigator.clipboard.writeText(payload);
                  toast({ title: "Copied OCR debug", variant: "success" });
                }}
              >
                Copy Debug JSON
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
