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
import { createBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ChevronDown, Paperclip } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { uiActionLog, uiActionMark } from "@/lib/ui-action-perf";
import { MatchStatusBadge } from "@/components/base";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import { AmountDiagnosticsPanel } from "@/components/ocr/amount-diagnostics-panel";
import {
  type AmountRuleDiagnostic,
  type FieldConfidence,
  type OcrSource,
  type ReceiptOcrResult,
  mergeReceiptOcrResults,
  runReceiptOcrForImageFile,
} from "@/lib/receipt-ocr-client";
import {
  uploadReceiptToStorage,
  type ExpenseReceiptUploadSlot,
} from "@/lib/expense-receipt-upload-browser";
import {
  deriveExpenseWorkflowStatus,
  EXPENSE_COMMON_ITEM_NONE,
  EXPENSE_PROJECT_SELECT_NONE,
} from "@/lib/expense-workflow-status";

type QuickExpenseAttachmentSlot = ExpenseReceiptUploadSlot;

const FIELD_LABEL = "text-xs uppercase tracking-wide text-muted-foreground";
/** iOS Safari avoids input zoom at 16px+; 44px min touch target on small screens. */
const FIELD_INPUT_CLASS = "max-md:min-h-11 max-md:text-base";
const CONTROL_H = "h-10";
const SELECT_TRIGGER = cn(
  CONTROL_H,
  "w-full rounded-sm border-border/60 text-sm [&>span]:line-clamp-1 max-md:min-h-11 max-md:text-base"
);
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
  const [saveFlash, setSaveFlash] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attachmentSlots, setAttachmentSlots] = React.useState<QuickExpenseAttachmentSlot[]>([]);
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
        fileName: s.pendingFile?.name ?? "Receipt",
        fileType: (s.pendingFile?.type === "application/pdf" ? "pdf" : "image") as "pdf" | "image",
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

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    if (processing || saving) return;
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

  const handleSave = async (saveAndNew?: boolean) => {
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
    const perfStart = uiActionMark();
    setSaving(true);
    setError(null);
    try {
      const effectivePaymentAccountId = paymentAccountId.trim();
      if (effectivePaymentAccountId) {
        paymentChoiceTouchedRef.current = true;
      }

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
          className="flex max-h-[min(92dvh,820px)] w-[calc(100vw-1.5rem)] max-w-[560px] flex-col gap-0 overflow-hidden rounded-sm border-border/60 p-0 sm:w-full"
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
          <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 px-4 py-2.5">
            <DialogTitle className="text-sm font-medium">Quick expense</DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              Save · Cmd/Ctrl+Enter = save &amp; new · Esc
            </p>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3 pt-2"
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
              onChange={(e) => {
                void handleFiles(e.target.files);
              }}
            />
            {!supabase ? (
              <p className="mb-2 shrink-0 text-xs text-amber-600 dark:text-amber-400">
                Supabase not configured — cannot save or scan receipts.
              </p>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              <div className="min-h-0 max-h-[min(50vh_360px)] shrink-0 space-y-2 overflow-y-auto md:max-h-none md:overflow-visible">
                {ocrSuggestions &&
                (fieldConfidence.vendor !== "high" ||
                  fieldConfidence.amount !== "high" ||
                  fieldConfidence.date !== "high") ? (
                  <div className="rounded-sm border border-amber-500/40 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] text-amber-950 dark:text-amber-100">
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

                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <label className={FIELD_LABEL}>Amount</label>
                    <Input
                      ref={amountInputRef}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={cn(
                        "mt-0.5 h-10 tabular-nums",
                        FIELD_INPUT_CLASS,
                        fieldConfidence.amount !== "high" && "border-amber-500/50"
                      )}
                      disabled={saving || !supabase}
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="quick-expense-vendor" className={FIELD_LABEL}>
                      Vendor
                    </label>
                    <Input
                      id="quick-expense-vendor"
                      ref={vendorInputRef}
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      className={cn("mt-0.5 h-10", FIELD_INPUT_CLASS)}
                      disabled={saving || !supabase}
                    />
                  </div>

                  <div className="min-w-0">
                    <label className={FIELD_LABEL}>Project</label>
                    <Input
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className={cn("mt-0.5 h-10 text-xs", FIELD_INPUT_CLASS)}
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
                        className={cn(SELECT_TRIGGER, "mt-1 text-xs")}
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
                    {projectId && projectId === suggestedProjectId ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <MatchStatusBadge kind="suggested" />
                        <span className="text-[10px] text-muted-foreground">
                          From recent activity.
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <label className={FIELD_LABEL}>Payment</label>
                    <PaymentAccountSelect
                      id="quick-expense-payment-select"
                      value={paymentAccountId}
                      onValueChange={onPaymentAccountChange}
                      disabled={saving}
                      className={cn(SELECT_TRIGGER, "mt-0.5 text-xs")}
                    />
                  </div>

                  <div className="min-w-0">
                    <label className={FIELD_LABEL}>Category</label>
                    <ExpenseCategorySelect
                      value={category}
                      onValueChange={setCategory}
                      disabled={saving}
                      className={cn(SELECT_TRIGGER, "mt-0.5 text-xs")}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className={FIELD_LABEL}>Date</label>
                    <Input
                      ref={dateInputRef}
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={cn(
                        "mt-0.5 h-10",
                        FIELD_INPUT_CLASS,
                        fieldConfidence.date !== "high" && "border-amber-500/50"
                      )}
                      disabled={saving || !supabase}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {supabase ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 max-md:min-h-11 touch-manipulation"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={processing || saving}
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Add receipt
                    </Button>
                  ) : null}
                  {processing ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <InlineLoading aria-hidden />
                      Scanning…
                    </span>
                  ) : null}
                  {attachmentSlots.length > 0 ? (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => openAttachmentSlotsAt(0)}
                      disabled={saving}
                    >
                      {attachmentSlots.length} attached — view
                    </button>
                  ) : null}
                </div>

                {duplicateCandidate ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-sm border border-amber-500/35 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                    <span className="min-w-0">
                      Possible duplicate · {duplicateCandidate.vendor} · {duplicateCandidate.date} ·
                      ${duplicateCandidate.amount.toLocaleString()}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="btn-outline-ghost h-6 shrink-0 px-2 text-[11px]"
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
              </div>

              <div className="mt-1 min-h-0 shrink border-t border-border/60 pt-1.5">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-sm py-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
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
                  <div className="max-h-[min(36vh_220px)] space-y-3 overflow-y-auto border-t border-border/40 py-2">
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
                        {attachmentSlots.some(
                          (s) => s.pendingFile && !s.attachmentPath && !s.receiptsPublicUrl
                        )
                          ? " · upload pending — retries on save"
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
                              key={idx}
                              type="button"
                              className="overflow-hidden rounded-sm border border-border/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              onClick={() => openAttachmentSlotsAt(idx)}
                              disabled={saving}
                              aria-label={`View attachment ${idx + 1}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- preview URL is blob/signed */}
                              <img
                                src={s.previewUrl}
                                alt=""
                                className="h-12 w-12 object-cover"
                                loading="lazy"
                              />
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
            </div>

            <div className="sticky bottom-0 z-[1] flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:flex-col max-md:items-stretch">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 max-md:min-h-11 touch-manipulation rounded-sm max-md:w-full"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <div className="flex w-full flex-wrap justify-end gap-2 max-md:flex-col md:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 max-md:min-h-11 touch-manipulation rounded-sm max-md:w-full"
                  onClick={() => void handleSave(true)}
                  disabled={saving || saveFlash || !supabase}
                >
                  {saveFlash ? "✔ Done" : "Save & new"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-10 max-md:min-h-11 touch-manipulation rounded-sm bg-black px-5 text-white hover:bg-neutral-900 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90 max-md:w-full"
                  disabled={saving || saveFlash || !supabase}
                >
                  <SubmitSpinner loading={saving} className="mr-2" />
                  {saving ? "Saving…" : saveFlash ? "✔ Done" : "Save"}
                </Button>
              </div>
            </div>

            {error ? <p className="mt-2 shrink-0 px-4 text-xs text-destructive">{error}</p> : null}
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
