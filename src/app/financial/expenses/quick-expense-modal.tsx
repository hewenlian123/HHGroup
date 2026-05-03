"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import {
  addExpenseAttachment,
  createQuickExpense,
  getExpenseTotal,
  getPaymentAccounts,
  type Expense,
  type PaymentAccountRow,
} from "@/lib/data";
import {
  pickDefaultPaymentAccountId,
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";
import { dedupeExpenseReceiptUploadSlots } from "@/lib/expense-attachment-dedupe";
import { createBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ChevronDown, FileText } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { uiActionLog, uiActionMark } from "@/lib/ui-action-perf";
import { MatchStatusBadge } from "@/components/base";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import { AmountDiagnosticsPanel } from "@/components/ocr/amount-diagnostics-panel";
import {
  type AmountRuleDiagnostic,
  type FieldConfidence,
  type MergedReceiptOcr,
  type OcrSource,
  type ReceiptOcrResult,
  mergeReceiptOcrResults,
  runReceiptOcrForImageFile,
} from "@/lib/receipt-ocr-client";
import {
  uploadReceiptToStorage,
  type ExpenseReceiptUploadSlot,
} from "@/lib/expense-receipt-upload-browser";
import { compressImageFileForReceiptUpload } from "@/lib/image-compress-browser";
import {
  deriveExpenseWorkflowStatus,
  EXPENSE_COMMON_ITEM_NONE,
  EXPENSE_PROJECT_SELECT_NONE,
} from "@/lib/expense-workflow-status";

type QuickExpenseAttachmentSlot = ExpenseReceiptUploadSlot;

const FIELD_LABEL = "block text-xs uppercase tracking-wide text-muted-foreground";
/** iOS Safari avoids input zoom at 16px+; 48px controls; 12px radius on mobile (Stripe / Settings feel). */
const FIELD_INPUT_CLASS =
  "max-md:h-12 max-md:min-h-[48px] max-md:rounded-xl max-md:text-base md:min-h-10 md:rounded-sm md:text-sm";
const CONTROL_H = "h-10 max-md:h-12 max-md:min-h-[48px] max-md:rounded-xl md:rounded-sm";
const SELECT_TRIGGER = cn(
  CONTROL_H,
  "w-full border-border/60 text-sm [&>span]:line-clamp-1 max-md:text-base"
);
const FIELD_GROUP = "flex flex-col gap-1.5";
const selectPopperContentProps = {
  position: "popper" as const,
  sideOffset: 4,
  className: "z-[200] max-h-[min(280px,var(--radix-select-content-available-height))]",
};

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

function isPdfFile(f: File): boolean {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
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
  const receiptPickLockRef = React.useRef(false);
  const replaceClientIdRef = React.useRef<string | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveFlash, setSaveFlash] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attachmentSlots, setAttachmentSlots] = React.useState<QuickExpenseAttachmentSlot[]>([]);
  const receiptPreparing = React.useMemo(
    () => attachmentSlots.some((s) => s.uploadUiStatus === "preparing"),
    [attachmentSlots]
  );
  const receiptUploading = React.useMemo(
    () => attachmentSlots.some((s) => s.uploadUiStatus === "uploading"),
    [attachmentSlots]
  );
  /** Compress or upload in flight — block duplicate picks and Save. */
  const receiptPipelineBusy = receiptPreparing || receiptUploading;
  const { openPreview } = useAttachmentPreview();

  React.useEffect(() => {
    if (!open) {
      setSaveFlash(false);
      setSaving(false);
    }
  }, [open]);

  const openAttachmentSlotsAt = React.useCallback(
    (initialIndex: number) => {
      if (attachmentSlots.length === 0) return;
      const files = attachmentSlots.map((s) => ({
        url: s.previewUrl,
        fileName: s.displayName ?? s.pendingFile?.name ?? "Receipt",
        fileType: (s.isPdf || s.pendingFile?.type === "application/pdf" ? "pdf" : "image") as
          | "pdf"
          | "image",
      }));
      const ix = Math.max(0, Math.min(initialIndex, files.length - 1));
      openPreview(files, ix);
    },
    [attachmentSlots, openPreview]
  );
  const [vendorName, setVendorName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = React.useState("Other");
  const [notes, setNotes] = React.useState("");
  const [projectSearch, setProjectSearch] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [paymentAccountRows, setPaymentAccountRows] = React.useState<PaymentAccountRow[]>([]);
  const paymentChoiceTouchedRef = React.useRef(false);
  /** When true for a field, OCR must not overwrite user input. */
  const ocrFieldTouchedRef = React.useRef({
    vendor: false,
    amount: false,
    date: false,
    category: false,
  });
  const [ocrBannerKind, setOcrBannerKind] = React.useState<
    "idle" | "success" | "partial" | "error"
  >("idle");
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
  const [catalogPick, setCatalogPick] = React.useState(EXPENSE_COMMON_ITEM_NONE);
  const [duplicateCandidate, setDuplicateCandidate] = React.useState<{
    id: string;
    vendor: string;
    date: string;
    amount: number;
  } | null>(null);
  const LAST_PROJECT_KEY = "hh.quick-expense-last-project-id";
  const OCR_LEARN_KEY = "hh.quick-expense-ocr-learn";
  const OCR_HISTORY_KEY = "hh.quick-expense-ocr-history";
  const vendorInputRef = React.useRef<HTMLInputElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const formScrollRef = React.useRef<HTMLDivElement>(null);
  /** Extra bottom padding when the on-screen keyboard reduces visual viewport (iOS Safari). */
  const [keyboardBottomInset, setKeyboardBottomInset] = React.useState(0);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const inferCategory = React.useCallback((vendor: string, itemNames: string[] = []) => {
    const haystack = `${vendor} ${itemNames.join(" ")}`.toLowerCase();
    if (/home depot|lowe'?s|lowes|costco|walmart|city mill|hardware hawaii/.test(haystack))
      return "Materials";
    if (/gas\s+station|gas|fuel|shell|chevron|exxon|mobil|bp\b/.test(haystack)) return "Vehicle";
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

  const removeReceiptSlot = React.useCallback((clientId: string) => {
    setAttachmentSlots((prev) =>
      prev.filter((s) => {
        if (s.clientId !== clientId) return true;
        s.revoke?.();
        return false;
      })
    );
  }, []);

  const retryReceiptUpload = React.useCallback(
    async (clientId: string) => {
      if (!supabase || receiptPickLockRef.current) return;
      let fileToRetry: File | undefined;
      setAttachmentSlots((prev) => {
        const s = prev.find((x) => x.clientId === clientId);
        fileToRetry = s?.sourceFile ?? s?.pendingFile;
        if (!fileToRetry) return prev;
        return prev.map((x) =>
          x.clientId === clientId
            ? { ...x, uploadUiStatus: "uploading", uploadError: undefined }
            : x
        );
      });
      if (!fileToRetry) return;
      receiptPickLockRef.current = true;
      try {
        const result = await uploadReceiptToStorage(
          supabase,
          fileToRetry,
          `r-${clientId.slice(0, 8)}`,
          {
            alreadyCompressed: true,
          }
        );
        setAttachmentSlots((prev) =>
          dedupeExpenseReceiptUploadSlots(
            prev.map((s) => {
              if (s.clientId !== clientId) return s;
              if (result.uploadError) {
                toast({
                  title: "Upload failed",
                  description: result.uploadError,
                  variant: "error",
                });
                return {
                  ...s,
                  ...result,
                  uploadUiStatus: "failed",
                  previewUrl: s.previewUrl,
                  revoke: s.revoke,
                  sourceFile: fileToRetry,
                  pendingFile: result.pendingFile,
                };
              }
              s.revoke?.();
              return {
                ...s,
                previewUrl: result.previewUrl,
                attachmentPath: result.attachmentPath,
                receiptsPublicUrl: result.receiptsPublicUrl,
                revoke: result.revoke,
                pendingFile: undefined,
                uploadError: undefined,
                uploadUiStatus: "uploaded",
                sourceFile: fileToRetry,
              };
            })
          )
        );
      } finally {
        receiptPickLockRef.current = false;
      }
    },
    [supabase, toast]
  );

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
    setMoreOpen(false);
    setError(null);
    setAttachmentSlots((prev) => {
      for (const s of prev) s.revoke?.();
      return [];
    });
    setVendorName("");
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setCategory("Other");
    setNotes("");
    setProjectSearch("");
    setProjectId("");
    setPaymentAccountId("");
    setPaymentAccountRows([]);
    paymentChoiceTouchedRef.current = false;
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
    setCatalogPick(EXPENSE_COMMON_ITEM_NONE);
    if (fileInputRef.current) fileInputRef.current.value = "";
    ocrFieldTouchedRef.current = {
      vendor: false,
      amount: false,
      date: false,
      category: false,
    };
    setOcrBannerKind("idle");
  }, []);

  React.useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = amountInputRef.current;
      if (!el) return;
      const raw = el.value.trim();
      const num = raw === "" ? NaN : Number.parseFloat(raw);
      if (!Number.isFinite(num) || num <= 0) {
        el.focus({ preventScroll: true });
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setKeyboardBottomInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardBottomInset(gap);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  const onPaymentAccountChange = React.useCallback((id: string) => {
    paymentChoiceTouchedRef.current = true;
    setPaymentAccountId(id);
    persistLastExpensePaymentAccountId(id);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getPaymentAccounts()
      .then((rows) => {
        if (cancelled) return;
        setPaymentAccountRows(rows);
        // Do not clobber a payment the user already picked while accounts were loading.
        if (!paymentChoiceTouchedRef.current) {
          setPaymentAccountId(pickDefaultPaymentAccountId(rows, ""));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPaymentAccountRows([]);
          if (!paymentChoiceTouchedRef.current) {
            setPaymentAccountId("");
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || paymentAccountRows.length === 0) return;
    if (paymentChoiceTouchedRef.current) return;
    const id = pickDefaultPaymentAccountId(paymentAccountRows, vendorName);
    if (id) setPaymentAccountId(id);
  }, [vendorName, open, paymentAccountRows]);

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
    if (projectId) return;
    try {
      const last = window.localStorage.getItem(LAST_PROJECT_KEY) ?? "";
      if (last && projects.some((p) => p.id === last)) setProjectId(last);
      else if (suggestedProjectId) setProjectId(suggestedProjectId);
    } catch {
      // ignore
    }
  }, [projectId, projects, suggestedProjectId]);

  const applyOcrMerge = React.useCallback(
    (merged: MergedReceiptOcr) => {
      setVendorName((prev) => {
        if (ocrFieldTouchedRef.current.vendor) return prev;
        if (merged.autoFillVendor) return merged.finalVendor;
        return prev;
      });
      setAmount((prev) => {
        if (ocrFieldTouchedRef.current.amount) return prev;
        if (merged.autoFillAmount && merged.sanitizedAmount != null) {
          return String(merged.sanitizedAmount);
        }
        return prev;
      });
      setDate((prev) => {
        if (ocrFieldTouchedRef.current.date) return prev;
        if (merged.autoFillDate && merged.clampedPurchase) return merged.clampedPurchase;
        return prev;
      });
      setCategory((prev) => {
        if (ocrFieldTouchedRef.current.category) return prev;
        if (merged.mappedCategory) return merged.mappedCategory;
        return prev;
      });
      setFieldConfidence({
        vendor: merged.vendorConfidence,
        amount: merged.amountConfidence,
        date: merged.dateConfidence,
      });
      setDetectedSnapshot(merged.detectedSnapshot);
      setRecognizedItems(merged.finalItems);
      setOcrSource(merged.source);
      setOcrSuggestions(merged.ocrSuggestions);
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
      setOcrBannerKind(merged.needsReview ? "partial" : "success");
      setPaymentAccountId((prev) => {
        if (paymentChoiceTouchedRef.current) return prev;
        const hint = (merged.suggestedPaymentMethod ?? "").toLowerCase();
        if (!hint) return prev;
        const match = paymentAccountRows.find((r) => {
          const n = (r.name ?? "").toLowerCase();
          if (!n) return false;
          if (hint === "cash") return /\bcash\b/.test(n);
          if (/\b(visa|card|credit|debit|mc|master)\b/.test(hint)) {
            return /\b(card|visa|credit|debit|master|amex|checking|bank)\b/i.test(n);
          }
          return n.includes(hint) || (hint.length >= 3 && n.includes(hint.slice(0, 3)));
        });
        return match?.id ?? prev;
      });
    },
    [paymentAccountRows]
  );

  const retryOcr = React.useCallback(async () => {
    if (receiptPickLockRef.current || saving || receiptPipelineBusy) return;
    const imageSlots = attachmentSlots.filter((s) => s.sourceFile?.type?.startsWith("image/"));
    if (!imageSlots.length) {
      toast({
        title: "No receipt image",
        description: "OCR needs a photo. PDFs are not scanned in the browser.",
        variant: "default",
      });
      return;
    }
    receiptPickLockRef.current = true;
    setProcessing(true);
    setOcrBannerKind("idle");
    setError(null);
    try {
      const ocrResults: Array<{ result: ReceiptOcrResult; source: OcrSource }> = [];
      for (const s of imageSlots) {
        if (s.sourceFile) {
          ocrResults.push(await runReceiptOcrForImageFile(s.sourceFile, { localTimeoutMs: 8000 }));
        }
      }
      if (!ocrResults.length) return;
      const merged = mergeReceiptOcrResults(ocrResults, {
        learnStorageKey: OCR_LEARN_KEY,
        inferCategory,
      });
      applyOcrMerge(merged);
      setDuplicateConfirmed(false);
      setDuplicateCandidate(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "OCR failed.";
      setError(msg);
      setOcrBannerKind("error");
      toast({ title: "OCR issue", description: msg, variant: "default" });
    } finally {
      setProcessing(false);
      receiptPickLockRef.current = false;
    }
  }, [applyOcrMerge, attachmentSlots, inferCategory, receiptPipelineBusy, saving, toast]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    if (receiptPickLockRef.current || saving || processing || receiptPipelineBusy) return;
    if (!supabase) {
      enterFallbackEdit("Storage is unavailable. Please enter expense details manually and save.");
      return;
    }

    const rawList = Array.from(files).filter((f) => f.size > 0);
    if (!rawList.length) return;

    const replaceId = replaceClientIdRef.current;
    replaceClientIdRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";

    const MAX = 5;
    let workRaws: File[];
    let workClientIds: string[];

    if (replaceId) {
      workRaws = [rawList[0]!];
      workClientIds = [replaceId];
    } else {
      const room = MAX - attachmentSlots.length;
      if (room <= 0) {
        toast({
          title: "Maximum receipts",
          description: "You can attach up to 5 receipts.",
          variant: "default",
        });
        return;
      }
      const take = rawList.slice(0, room);
      workRaws = take;
      workClientIds = take.map(() => crypto.randomUUID());
    }

    receiptPickLockRef.current = true;
    setError(null);

    const makeImmediateSlot = (raw: File, clientId: string): QuickExpenseAttachmentSlot => {
      const isPdf = isPdfFile(raw);
      const url = URL.createObjectURL(raw);
      return {
        clientId,
        previewUrl: url,
        localPreviewUrl: url,
        attachmentPath: null,
        receiptsPublicUrl: null,
        displayName: raw.name || (isPdf ? "document.pdf" : "Photo"),
        isPdf,
        uploadUiStatus: isPdf ? "uploading" : "preparing",
        sourceFile: raw,
        revoke: () => URL.revokeObjectURL(url),
      };
    };

    try {
      if (replaceId) {
        setAttachmentSlots((prev) =>
          prev.map((s) => {
            if (s.clientId !== replaceId) return s;
            s.revoke?.();
            return makeImmediateSlot(workRaws[0]!, replaceId);
          })
        );
      } else {
        setAttachmentSlots((prev) => [
          ...prev,
          ...workRaws.map((raw, i) => makeImmediateSlot(raw, workClientIds[i]!)),
        ]);
      }

      const preparedList = await Promise.all(
        workRaws.map((raw, i) =>
          compressImageFileForReceiptUpload(raw).then((prepared) => ({
            clientId: workClientIds[i]!,
            prepared,
          }))
        )
      );

      const qualityWarning = await assessImageQuality(preparedList[0]!.prepared);
      if (qualityWarning) {
        toast({ title: "Image quality warning", description: qualityWarning, variant: "default" });
      }

      setAttachmentSlots((prev) =>
        prev.map((s) => {
          const hit = preparedList.find((p) => p.clientId === s.clientId);
          if (!hit) return s;
          s.revoke?.();
          const url = URL.createObjectURL(hit.prepared);
          const pdf = isPdfFile(hit.prepared);
          return {
            ...s,
            previewUrl: url,
            localPreviewUrl: url,
            displayName: hit.prepared.name,
            isPdf: pdf,
            sourceFile: hit.prepared,
            uploadUiStatus: "uploading",
            revoke: () => URL.revokeObjectURL(url),
          };
        })
      );

      const runOcr = async () => {
        setProcessing(true);
        setOcrSource("none");
        try {
          const ocrResults: Array<{ result: ReceiptOcrResult; source: OcrSource }> = [];
          for (const { prepared } of preparedList) {
            ocrResults.push(await runReceiptOcrForImageFile(prepared, { localTimeoutMs: 8000 }));
          }

          const merged = mergeReceiptOcrResults(ocrResults, {
            learnStorageKey: OCR_LEARN_KEY,
            inferCategory,
          });
          applyOcrMerge(merged);
          setDuplicateConfirmed(false);
          setDuplicateCandidate(null);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "OCR failed.";
          setError(msg);
          setOcrBannerKind("error");
          toast({
            title: "OCR issue",
            description: msg,
            variant: "default",
          });
        } finally {
          setProcessing(false);
        }
      };

      let firstUploadErr: string | undefined;
      const runUploads = async () => {
        await Promise.all(
          preparedList.map(async ({ clientId, prepared }) => {
            const result = await uploadReceiptToStorage(supabase, prepared, clientId.slice(0, 8), {
              alreadyCompressed: true,
            });
            if (result.uploadError && !firstUploadErr) firstUploadErr = result.uploadError;
            setAttachmentSlots((prev) =>
              prev.map((s) => {
                if (s.clientId !== clientId) return s;
                if (result.uploadError) {
                  return {
                    ...s,
                    ...result,
                    uploadUiStatus: "failed",
                    previewUrl: s.previewUrl,
                    revoke: s.revoke,
                    sourceFile: prepared,
                    pendingFile: result.pendingFile,
                  };
                }
                s.revoke?.();
                return {
                  ...s,
                  previewUrl: result.previewUrl,
                  attachmentPath: result.attachmentPath,
                  receiptsPublicUrl: result.receiptsPublicUrl,
                  revoke: result.revoke,
                  pendingFile: undefined,
                  uploadError: undefined,
                  uploadUiStatus: "uploaded",
                  sourceFile: prepared,
                };
              })
            );
          })
        );
        if (firstUploadErr) {
          toast({
            title: "Upload failed",
            description: firstUploadErr,
            variant: "error",
          });
        }
      };

      await Promise.all([runOcr(), runUploads()]);
      setAttachmentSlots((prev) => dedupeExpenseReceiptUploadSlots(prev));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not process receipts.";
      toast({ title: "Receipt error", description: msg, variant: "error" });
    } finally {
      receiptPickLockRef.current = false;
    }
  };

  const handleSave = async (saveAndNew?: boolean) => {
    if (saving || receiptPipelineBusy) return;
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
    const perfStart = uiActionMark();
    setSaving(true);
    setError(null);
    try {
      const effectivePaymentAccountId = paymentAccountId.trim();
      if (effectivePaymentAccountId) {
        paymentChoiceTouchedRef.current = true;
      }

      const slotsDeduped = dedupeExpenseReceiptUploadSlots(attachmentSlots);
      if (slotsDeduped.length !== attachmentSlots.length) {
        setAttachmentSlots(slotsDeduped);
      }
      let slotsToSave = slotsDeduped;
      if (supabase) {
        slotsToSave = await Promise.all(
          slotsDeduped.map(async (s, i) => {
            if (s.pendingFile && !s.attachmentPath && !s.receiptsPublicUrl) {
              const u = await uploadReceiptToStorage(supabase, s.pendingFile, `save-${i}`, {
                alreadyCompressed: true,
              });
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
        receiptUrl: firstPublic || undefined,
        sourceType: slotsToSave.length > 0 ? "receipt_upload" : "company",
        category,
        initialStatus: deriveExpenseWorkflowStatus(projectId || null, category),
        notes: (() => {
          const userNotes = notes.trim();
          const itemsPart = `Items: ${dedupeItems(recognizedItems).join(", ")}`;
          if (!itemsPart || dedupeItems(recognizedItems).length === 0)
            return userNotes || undefined;
          return userNotes ? `${userNotes}\n${itemsPart}` : itemsPart;
        })(),
        projectId: projectId || null,
        paymentAccountId: effectivePaymentAccountId || null,
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
        durationMs: 14_000,
      });
      if (
        slotsToSave.length > 0 &&
        !firstPublic &&
        !hasStoragePath &&
        slotsToSave.some((s) => s.uploadError || s.pendingFile)
      ) {
        toast({
          title: "Receipt not stored in cloud",
          description:
            "Images could not be stored in Supabase (check buckets/policies). Add receipts from the expense detail page if needed.",
          variant: "default",
          durationMs: 14_000,
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
      const paSaved = effectivePaymentAccountId;
      if (paSaved) {
        persistLastExpensePaymentAccountId(paSaved);
        rememberExpenseVendorPaymentAccount(vendorName.trim() || "Unknown", paSaved);
      }
      setSaving(false);
      uiActionLog("quick-expense-save-ui", perfStart, 100);
      setSaveFlash(true);
      void onSuccess();
      window.setTimeout(() => {
        setSaveFlash(false);
        if (saveAndNew) {
          setVendorName("");
          setAmount("");
          setDate(new Date().toISOString().slice(0, 10));
          setCategory("Other");
          paymentChoiceTouchedRef.current = false;
          setPaymentAccountId(
            paymentAccountRows.length > 0 ? pickDefaultPaymentAccountId(paymentAccountRows, "") : ""
          );
          if (paymentAccountRows.length === 0) {
            void getPaymentAccounts().then((rows) => {
              setPaymentAccountRows(rows);
              setPaymentAccountId(pickDefaultPaymentAccountId(rows, ""));
            });
          }
          setNotes("");
          setRecognizedItems([]);
          setItemDraft("");
          setCatalogPick(EXPENSE_COMMON_ITEM_NONE);
          setOcrSuggestions(null);
          setFieldConfidence({ vendor: "low", amount: "low", date: "low" });
          setDetectedSnapshot(null);
          setDuplicateConfirmed(false);
          setDuplicateCandidate(null);
          setDebugData(null);
          setAttachmentSlots((prev) => {
            for (const s of prev) s.revoke?.();
            return [];
          });
          if (fileInputRef.current) fileInputRef.current.value = "";
          setError(null);
          window.setTimeout(() => {
            const el = amountInputRef.current;
            if (!el) return;
            const raw = el.value.trim();
            const num = raw === "" ? NaN : Number.parseFloat(raw);
            if (!Number.isFinite(num) || num <= 0) {
              el.focus({ preventScroll: true });
            }
          }, 0);
        } else {
          onOpenChange(false);
        }
      }, 220);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save expense.";
      setError(msg);
      toast({ title: "Save failed", description: msg, variant: "error" });
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "flex flex-col gap-0 overflow-hidden border-border/60 p-0 shadow-none",
            "md:max-h-[min(92dvh,820px)] md:max-w-[560px] md:w-full md:rounded-sm",
            "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:right-0 max-md:flex max-md:max-h-[94dvh] max-md:min-h-[82dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-t-[14px] max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 max-md:border-t max-md:p-0",
            "max-md:data-[state=open]:!animate-hh-sheet-in max-md:data-[state=closed]:!animate-hh-sheet-out"
          )}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onOpenChange(false);
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              const tag = (e.target as HTMLElement).tagName?.toLowerCase();
              if (tag !== "textarea") {
                e.preventDefault();
                void handleSave(true);
              }
            }
          }}
        >
          <div
            className="mx-auto mt-1.5 hidden h-px w-9 shrink-0 rounded-full bg-muted-foreground/25 max-md:block"
            aria-hidden
          />
          <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 bg-background px-4 pb-3 pt-1 max-md:pt-0">
            <DialogTitle className="text-[17px] font-semibold leading-tight tracking-tight md:text-sm md:font-medium">
              Quick expense
            </DialogTitle>
            <p className="hidden text-[11px] text-muted-foreground md:block">
              Save · Cmd/Ctrl+Enter = save &amp; new · Esc
            </p>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col overflow-hidden max-md:min-h-0 max-md:flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave(false);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              className="hidden"
              data-testid="quick-expense-receipt-input"
              disabled={saving || receiptPipelineBusy}
              onChange={(e) => {
                void handleFiles(e.target.files);
              }}
            />
            {!supabase ? (
              <p className="shrink-0 px-4 pt-2 text-xs text-amber-600 dark:text-amber-400">
                Supabase not configured — cannot save or scan receipts.
              </p>
            ) : null}

            <div
              ref={formScrollRef}
              style={{
                paddingBottom:
                  keyboardBottomInset > 0 ? `${keyboardBottomInset + 12}px` : undefined,
              }}
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-2 pt-2",
                "scroll-pb-[calc(7.5rem+env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]"
              )}
            >
              {ocrSuggestions &&
              (fieldConfidence.vendor !== "high" ||
                fieldConfidence.amount !== "high" ||
                fieldConfidence.date !== "high") ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] text-amber-950 dark:text-amber-100">
                  <p className="font-medium text-amber-900 dark:text-amber-50">Verify OCR</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-amber-900/90 dark:text-amber-100/90">
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

              <div className="mt-2 grid grid-cols-1 gap-y-4 md:grid-cols-2 md:gap-x-3 md:gap-y-3">
                <div className={cn(FIELD_GROUP, "min-w-0 md:col-span-1")}>
                  <label className={FIELD_LABEL}>Amount</label>
                  <Input
                    ref={amountInputRef}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      ocrFieldTouchedRef.current.amount = true;
                      setAmount(e.target.value);
                    }}
                    className={cn(
                      "tabular-nums",
                      FIELD_INPUT_CLASS,
                      fieldConfidence.amount !== "high" && "border-amber-500/50"
                    )}
                    disabled={saving || !supabase}
                  />
                </div>
                <div className={cn(FIELD_GROUP, "min-w-0 md:col-span-1")}>
                  <label htmlFor="quick-expense-vendor" className={FIELD_LABEL}>
                    Vendor
                  </label>
                  <Input
                    id="quick-expense-vendor"
                    ref={vendorInputRef}
                    value={vendorName}
                    onChange={(e) => {
                      ocrFieldTouchedRef.current.vendor = true;
                      setVendorName(e.target.value);
                    }}
                    className={FIELD_INPUT_CLASS}
                    disabled={saving || !supabase}
                  />
                </div>

                <div className={cn(FIELD_GROUP, "min-w-0 md:col-span-2")}>
                  <label className={FIELD_LABEL}>Project</label>
                  <div className="flex flex-col gap-2">
                    <Input
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className={cn("text-xs", FIELD_INPUT_CLASS)}
                      placeholder="Search…"
                      disabled={saving}
                    />
                    <Select
                      disabled={saving}
                      value={projectId.trim() ? projectId : EXPENSE_PROJECT_SELECT_NONE}
                      onValueChange={(v) =>
                        setProjectId(v === EXPENSE_PROJECT_SELECT_NONE ? "" : v)
                      }
                    >
                      <SelectTrigger
                        id="quick-expense-project-select"
                        className={cn(SELECT_TRIGGER, "text-xs")}
                      >
                        <SelectValue placeholder="No project" />
                      </SelectTrigger>
                      <SelectContent {...selectPopperContentProps}>
                        <SelectItem value={EXPENSE_PROJECT_SELECT_NONE}>No project</SelectItem>
                        {projectOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name ?? p.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {projectId && projectId === suggestedProjectId ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <MatchStatusBadge kind="suggested" />
                      <span className="text-[10px] text-muted-foreground">
                        From recent activity.
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className={cn(FIELD_GROUP, "min-w-0 md:col-span-2")}>
                  <label className={FIELD_LABEL}>Payment</label>
                  <PaymentAccountSelect
                    id="quick-expense-payment-select"
                    value={paymentAccountId}
                    onValueChange={onPaymentAccountChange}
                    disabled={saving}
                    className={cn(SELECT_TRIGGER, "text-xs")}
                  />
                </div>

                <div className={cn(FIELD_GROUP, "min-w-0 md:col-span-2")}>
                  <label className={FIELD_LABEL}>Category</label>
                  <ExpenseCategorySelect
                    value={category}
                    onValueChange={(v) => {
                      ocrFieldTouchedRef.current.category = true;
                      setCategory(v);
                    }}
                    disabled={saving}
                    className={cn(SELECT_TRIGGER, "text-xs")}
                  />
                </div>
                <div className={cn(FIELD_GROUP, "min-w-0 w-full md:col-span-2")}>
                  <label className={FIELD_LABEL}>Date</label>
                  <Input
                    ref={dateInputRef}
                    type="date"
                    value={date}
                    onChange={(e) => {
                      ocrFieldTouchedRef.current.date = true;
                      setDate(e.target.value);
                    }}
                    className={cn(
                      "min-h-[48px] w-full min-w-0 max-md:h-12",
                      FIELD_INPUT_CLASS,
                      fieldConfidence.date !== "high" && "border-amber-500/50"
                    )}
                    disabled={saving || !supabase}
                  />
                </div>
              </div>

              <div className="mt-4 flex min-w-0 flex-col gap-2">
                {attachmentSlots.map((slot, idx) => {
                  const cid = slot.clientId ?? `idx-${idx}`;
                  const st = slot.uploadUiStatus;
                  const statusLabel =
                    st === "preparing"
                      ? "Preparing image…"
                      : st === "uploading"
                        ? "Uploading…"
                        : st === "failed"
                          ? "Failed — retry or remove"
                          : st === "uploaded" || slot.attachmentPath || slot.receiptsPublicUrl
                            ? "Uploaded"
                            : "Preview";
                  return (
                    <div
                      key={cid}
                      className="flex min-w-0 gap-2 border-b border-border/60 pb-2 last:border-b-0"
                    >
                      <button
                        type="button"
                        className="h-14 w-14 shrink-0 overflow-hidden rounded-sm border border-border/60 touch-manipulation"
                        onClick={() => openAttachmentSlotsAt(idx)}
                        disabled={!slot.previewUrl || saving}
                        aria-label="Preview receipt"
                      >
                        {slot.isPdf ? (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] text-muted-foreground">
                            <FileText className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden />
                            <span className="truncate">PDF</span>
                          </div>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={slot.previewUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium leading-snug text-foreground">
                          {slot.displayName ?? slot.pendingFile?.name ?? "Receipt"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{statusLabel}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-[11px]"
                            disabled={saving || receiptPipelineBusy}
                            onClick={() => {
                              if (slot.clientId) {
                                replaceClientIdRef.current = slot.clientId;
                                fileInputRef.current?.click();
                              }
                            }}
                          >
                            Replace
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-[11px]"
                            disabled={saving || receiptPipelineBusy}
                            onClick={() => slot.clientId && removeReceiptSlot(slot.clientId)}
                          >
                            Remove
                          </Button>
                          {slot.uploadUiStatus === "failed" && slot.clientId ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-[11px]"
                              disabled={saving}
                              data-testid={idx === 0 ? "quick-expense-receipt-retry" : undefined}
                              onClick={() => void retryReceiptUpload(slot.clientId!)}
                            >
                              Retry
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {supabase && attachmentSlots.length < 5 ? (
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-14 w-full min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border/60 px-4 py-3 text-center transition-colors",
                      "hover:bg-accent/25 active:bg-accent/35",
                      "disabled:pointer-events-none disabled:opacity-50"
                    )}
                    onClick={() => {
                      replaceClientIdRef.current = null;
                      fileInputRef.current?.click();
                    }}
                    disabled={processing || saving || receiptPipelineBusy}
                    aria-label="Take photo or upload receipt"
                  >
                    <span className="text-sm font-medium text-foreground">
                      Take photo / Upload receipt
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Camera, photo library, or PDF
                    </span>
                  </button>
                ) : null}
                {receiptPreparing ? (
                  <p className="text-[11px] text-muted-foreground" role="status">
                    <span className="inline-flex items-center gap-1.5">
                      <InlineLoading aria-hidden />
                      Preparing image…
                    </span>
                  </p>
                ) : null}
                {!receiptPreparing && receiptUploading ? (
                  <p className="text-[11px] text-muted-foreground" role="status">
                    Uploading receipt…
                  </p>
                ) : null}
                {!receiptPipelineBusy && processing ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <InlineLoading aria-hidden />
                    Processing receipt…
                  </span>
                ) : null}
                {!receiptPipelineBusy && !processing && ocrBannerKind === "success" ? (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400" role="status">
                    Receipt scanned. Fields autofilled.
                  </p>
                ) : null}
                {!receiptPipelineBusy && !processing && ocrBannerKind === "partial" ? (
                  <p className="text-[11px] text-amber-800 dark:text-amber-200" role="status">
                    Could not fully read receipt. Please review.
                  </p>
                ) : null}
                {!receiptPipelineBusy && !processing && ocrBannerKind === "error" ? (
                  <p className="text-[11px] text-destructive" role="status">
                    OCR could not run. You can still save or retry.
                  </p>
                ) : null}
                {attachmentSlots.some((s) => s.sourceFile?.type?.startsWith("image/")) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-fit px-2 text-[11px]"
                    disabled={processing || receiptPipelineBusy || saving}
                    data-testid="quick-expense-retry-ocr"
                    onClick={() => void retryOcr()}
                  >
                    Retry OCR
                  </Button>
                ) : null}
              </div>

              {duplicateCandidate ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/35 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                  <span className="min-w-0">
                    Possible duplicate · {duplicateCandidate.vendor} · {duplicateCandidate.date} · $
                    {duplicateCandidate.amount.toLocaleString()}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="btn-outline-ghost h-8 min-h-11 shrink-0 px-2 text-[11px] md:min-h-8"
                    asChild
                  >
                    <a
                      href={`/financial/expenses/${duplicateCandidate.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </Button>
                </div>
              ) : null}

              <div className="mt-4 min-h-0 shrink-0 border-t border-border/60 pt-2">
                <button
                  type="button"
                  className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 rounded-sm py-2 text-left text-[11px] text-muted-foreground hover:text-foreground md:min-h-0 md:py-1"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                >
                  <span>Items, notes, attachments</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      moreOpen && "rotate-180"
                    )}
                    aria-hidden
                  />
                </button>
                {moreOpen ? (
                  <div className="max-h-[min(36vh,220px)] space-y-3 overflow-y-auto border-t border-border/40 py-2">
                    <div>
                      <label className={FIELD_LABEL}>Items</label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {dedupeItems(recognizedItems).map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1 rounded-sm border border-border/60 px-1.5 py-0.5 text-[11px]"
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
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Input
                          value={itemDraft}
                          onChange={(e) => setItemDraft(e.target.value)}
                          className={cn("h-10 text-xs", FIELD_INPUT_CLASS)}
                          placeholder="Add item"
                          disabled={saving}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 shrink-0 max-md:min-h-11 touch-manipulation"
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
                      <Select
                        disabled={saving}
                        value={catalogPick}
                        onValueChange={(v) => {
                          if (v !== EXPENSE_COMMON_ITEM_NONE) {
                            setRecognizedItems((prev) => dedupeItems([...prev, v]));
                          }
                          setCatalogPick(EXPENSE_COMMON_ITEM_NONE);
                        }}
                      >
                        <SelectTrigger className={cn(SELECT_TRIGGER, "mt-1.5 text-xs")}>
                          <SelectValue placeholder="Common items…" />
                        </SelectTrigger>
                        <SelectContent {...selectPopperContentProps}>
                          <SelectItem value={EXPENSE_COMMON_ITEM_NONE}>Common items…</SelectItem>
                          {ITEM_CATALOG.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={FIELD_LABEL}>Notes</label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className={cn("mt-0.5 min-h-[80px] resize-y text-xs", FIELD_INPUT_CLASS)}
                        placeholder="Optional"
                        disabled={saving}
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className={FIELD_LABEL}>Attachments</label>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {attachmentSlots.length} file(s)
                        {receiptPreparing
                          ? " · preparing image"
                          : receiptUploading
                            ? " · uploading"
                            : ""}
                        {attachmentSlots.some(
                          (s) =>
                            s.uploadUiStatus === "failed" || (s.pendingFile && !s.attachmentPath)
                        )
                          ? " · some need retry or will retry on save"
                          : ""}
                      </p>
                      {attachmentSlots.some((s) => s.uploadError) ? (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                          {attachmentSlots.find((s) => s.uploadError)?.uploadError}
                        </p>
                      ) : null}
                      {attachmentSlots.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {attachmentSlots.map((s, idx) => (
                            <button
                              key={s.clientId ?? idx}
                              type="button"
                              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              onClick={() => openAttachmentSlotsAt(idx)}
                              disabled={saving}
                              aria-label={`View attachment ${idx + 1}`}
                            >
                              {s.isPdf ? (
                                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
                              ) : (
                                /* eslint-disable-next-line @next/next/no-img-element -- preview URL is blob/signed */
                                <img
                                  src={s.previewUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {process.env.NODE_ENV !== "production" && ocrSource !== "none" ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                        <span>
                          OCR:{" "}
                          {ocrSource === "cloud"
                            ? "cloud"
                            : ocrSource === "local"
                              ? "local"
                              : "manual"}
                        </span>
                        {debugUnlocked ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="btn-outline-ghost h-7 px-2 text-[11px]"
                            onClick={() => setDebugOpen(true)}
                          >
                            Debug
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
            </div>

            <div className="z-[2] shrink-0 border-t border-border/60 bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex flex-col gap-2 md:hidden">
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  className="h-12 min-h-[48px] w-full touch-manipulation rounded-xl"
                  disabled={saving || saveFlash || !supabase || receiptPipelineBusy}
                >
                  <SubmitSpinner loading={saving} className="mr-2" />
                  {saving
                    ? "Saving…"
                    : receiptPreparing
                      ? "Preparing image…"
                      : receiptUploading
                        ? "Uploading receipt…"
                        : processing
                          ? "Processing receipt…"
                          : saveFlash
                            ? "✔ Done"
                            : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-12 min-h-[48px] w-full touch-manipulation rounded-xl shadow-none"
                  onClick={() => void handleSave(true)}
                  disabled={saving || saveFlash || !supabase || receiptPipelineBusy}
                >
                  {saveFlash
                    ? "✔ Done"
                    : receiptPreparing
                      ? "Preparing image…"
                      : receiptUploading
                        ? "Uploading receipt…"
                        : processing
                          ? "Processing receipt…"
                          : "Save & new"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 min-h-[44px] w-full touch-manipulation rounded-xl"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
              </div>
              <div className="hidden md:flex md:flex-row md:items-center md:justify-between md:gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 shrink-0 rounded-md"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-md shadow-none"
                    onClick={() => void handleSave(true)}
                    disabled={saving || saveFlash || !supabase || receiptPipelineBusy}
                  >
                    {saveFlash
                      ? "✔ Done"
                      : receiptPreparing
                        ? "Preparing image…"
                        : receiptUploading
                          ? "Uploading receipt…"
                          : processing
                            ? "Processing receipt…"
                            : "Save & new"}
                  </Button>
                  <Button
                    type="submit"
                    variant="default"
                    size="sm"
                    className="h-10 rounded-md"
                    disabled={saving || saveFlash || !supabase || receiptPipelineBusy}
                  >
                    <SubmitSpinner loading={saving} className="mr-2" />
                    {saving
                      ? "Saving…"
                      : receiptPreparing
                        ? "Preparing image…"
                        : receiptUploading
                          ? "Uploading receipt…"
                          : processing
                            ? "Processing receipt…"
                            : saveFlash
                              ? "✔ Done"
                              : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
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
