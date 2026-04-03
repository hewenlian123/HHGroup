"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { AmountDiagnosticsPanel } from "@/components/ocr/amount-diagnostics-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  type AmountRuleDiagnostic,
  type FieldConfidence,
  type OcrSource,
  mergeReceiptOcrResults,
  runReceiptOcrForImageFile,
} from "@/lib/receipt-ocr-client";

type Option = { id: string; name: string };

const WORKER_OCR_LEARN_KEY = "hh.worker-receipt-ocr-learn";

const EXPENSE_OPTIONS: { value: string; zh: string; en: string }[] = [
  { value: "Building Materials", zh: "建筑材料", en: "Building Materials" },
  { value: "Tools", zh: "工具设备", en: "Tools" },
  { value: "Food", zh: "餐饮", en: "Food" },
  { value: "Transportation", zh: "交通费", en: "Transportation" },
  { value: "Supplies", zh: "日常用品", en: "Supplies" },
  { value: "Other", zh: "其他", en: "Other" },
];

/** Map Quick Expense–style category labels to worker expense type values. */
function mapQuickCategoryToWorkerExpenseType(cat: string): string {
  switch (cat) {
    case "Materials":
      return "Building Materials";
    case "Vehicle":
      return "Transportation";
    case "Meals":
      return "Food";
    default:
      return "Other";
  }
}

function inferWorkerReceiptCategory(vendor: string, itemNames: string[]): string {
  const haystack = `${vendor} ${itemNames.join(" ")}`.toLowerCase();
  if (/home depot|lowe'?s|lowes/.test(haystack)) return "Materials";
  if (/gas|fuel|shell|chevron|exxon|mobil|bp/.test(haystack)) return "Vehicle";
  if (/restaurant|cafe|coffee|diner|bbq|burger|pizza/.test(haystack)) return "Meals";
  return "Other";
}

function normalizeVendor(v: string): string {
  return (v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function Label({ zh, en }: { zh: string; en: string }) {
  return (
    <label className="block mb-2">
      <span className="text-sm font-medium text-foreground">{zh}</span>
      <span className="text-xs text-muted-foreground ml-2">{en}</span>
    </label>
  );
}

export function UploadReceiptClient() {
  const [workers, setWorkers] = React.useState<Option[]>([]);
  const [projects, setProjects] = React.useState<Option[]>([]);
  const [workerId, setWorkerId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [expenseType, setExpenseType] = React.useState(EXPENSE_OPTIONS[0].value);
  const [vendor, setVendor] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [receiptDate, setReceiptDate] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [ocrBusy, setOcrBusy] = React.useState(false);
  const [ocrFieldConfidence, setOcrFieldConfidence] = React.useState<{
    vendor: FieldConfidence;
    amount: FieldConfidence;
    date: FieldConfidence;
  } | null>(null);
  const [ocrSuggestions, setOcrSuggestions] = React.useState<{
    vendor: string;
    amount: string;
    date: string;
  } | null>(null);
  const [ocrDetectedSnapshot, setOcrDetectedSnapshot] = React.useState<{
    vendor: string;
    amount: number;
  } | null>(null);
  const [ocrSource, setOcrSource] = React.useState<OcrSource>("none");
  const [ocrMatchedRules, setOcrMatchedRules] = React.useState<string[]>([]);
  const [ocrAmountDiagnostics, setOcrAmountDiagnostics] = React.useState<AmountRuleDiagnostic[]>(
    []
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  const loadOptions = React.useCallback(async () => {
    try {
      const r = await fetch("/api/upload-receipt/options");
      const d = await r.json();
      if (d.workers) setWorkers(d.workers);
      if (d.projects) setProjects(d.projects);
    } catch {
      setMessage("无法加载 / Could not load");
    }
  }, []);

  React.useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useOnAppSync(
    React.useCallback(() => {
      void loadOptions();
    }, [loadOptions]),
    [loadOptions]
  );

  const workerName = React.useMemo(() => {
    const w = workers.find((x) => x.id === workerId);
    return w?.name ?? "";
  }, [workers, workerId]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setMessage(null);
    setOcrFieldConfidence(null);
    setOcrSuggestions(null);
    setOcrDetectedSnapshot(null);
    setOcrSource("none");
    setOcrMatchedRules([]);
    setOcrAmountDiagnostics([]);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      return;
    }
    void (async () => {
      setOcrBusy(true);
      try {
        const one = await runReceiptOcrForImageFile(f, { localTimeoutMs: 8000 });
        const merged = mergeReceiptOcrResults([one], {
          learnStorageKey: WORKER_OCR_LEARN_KEY,
          inferCategory: inferWorkerReceiptCategory,
        });
        setVendor(merged.autoFillVendor ? merged.finalVendor : "");
        setAmount(
          merged.autoFillAmount && merged.sanitizedAmount != null
            ? String(merged.sanitizedAmount)
            : ""
        );
        setReceiptDate(merged.autoFillDate && merged.clampedPurchase ? merged.clampedPurchase : "");
        if (merged.mappedCategory !== "Other") {
          setExpenseType(mapQuickCategoryToWorkerExpenseType(merged.mappedCategory));
        }
        setOcrFieldConfidence({
          vendor: merged.vendorConfidence,
          amount: merged.amountConfidence,
          date: merged.dateConfidence,
        });
        setOcrSuggestions(merged.ocrSuggestions);
        setOcrDetectedSnapshot(merged.detectedSnapshot);
        setOcrSource(merged.source);
        setOcrMatchedRules(merged.matchedRules);
        setOcrAmountDiagnostics(merged.amountDiagnostics);
      } catch {
        setMessage("收据识别失败，请手动填写 / OCR failed; please fill in manually");
      } finally {
        setOcrBusy(false);
      }
    })();
  };

  const resetForm = () => {
    setDone(false);
    setWorkerId("");
    setProjectId("");
    setExpenseType(EXPENSE_OPTIONS[0].value);
    setVendor("");
    setAmount("");
    setNotes("");
    setReceiptDate("");
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewOpen(false);
    setMessage(null);
    setOcrBusy(false);
    setOcrFieldConfidence(null);
    setOcrSuggestions(null);
    setOcrDetectedSnapshot(null);
    setOcrSource("none");
    setOcrMatchedRules([]);
    setOcrAmountDiagnostics([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!workerId) {
      setMessage("请选择工人 / Select a worker");
      return;
    }
    if (!file) {
      setMessage("请上传发票照片 / Add receipt photo");
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0) {
      setMessage("请输入正确金额 / Enter valid amount");
      return;
    }

    setUploading(true);
    try {
      // Debug: upload + submit start
      // eslint-disable-next-line no-console
      console.log("[UploadReceipt] submit start", {
        workerId,
        workerName,
        projectId,
        expenseType,
        fileName: file?.name,
        fileSize: file?.size,
      });
      const fd = new FormData();
      fd.set("file", file);
      const up = await fetch("/api/upload-receipt/upload", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok || !upData.receipt_url) {
        throw new Error(upData.message ?? "上传失败 / Upload failed");
      }
      // Debug: upload success
      // eslint-disable-next-line no-console
      console.log("[UploadReceipt] upload success", { receiptUrl: upData.receipt_url });
      setUploading(false);
      setSubmitting(true);
      const res = await fetch("/api/upload-receipt/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId,
          workerName,
          projectId: projectId || null,
          expenseType,
          vendor: vendor.trim() || null,
          amount: num,
          receiptUrl: upData.receipt_url,
          description: null,
          notes: notes.trim() || null,
          receiptDate: receiptDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "提交失败 / Submit failed");
      // Debug: submit success
      // eslint-disable-next-line no-console
      console.log("[UploadReceipt] submit success", { id: data.id });
      try {
        if (ocrDetectedSnapshot) {
          const vendorTrim = vendor.trim();
          const changedVendor =
            normalizeVendor(vendorTrim) !== normalizeVendor(ocrDetectedSnapshot.vendor);
          const changedAmount = Math.abs(num - ocrDetectedSnapshot.amount) >= 0.01;
          if (changedVendor || changedAmount) {
            const raw = window.localStorage.getItem(WORKER_OCR_LEARN_KEY);
            const learned = raw
              ? (JSON.parse(raw) as {
                  vendorAliases?: Record<string, string>;
                  amountHints?: Record<string, number>;
                })
              : {};
            const key = normalizeVendor(ocrDetectedSnapshot.vendor);
            if (changedVendor) {
              learned.vendorAliases = learned.vendorAliases ?? {};
              learned.vendorAliases[key] = vendorTrim || ocrDetectedSnapshot.vendor;
            }
            if (changedAmount) {
              learned.amountHints = learned.amountHints ?? {};
              learned.amountHints[key] = num;
            }
            window.localStorage.setItem(WORKER_OCR_LEARN_KEY, JSON.stringify(learned));
          }
        }
      } catch {
        // ignore
      }
      setDone(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "出错 / Something went wrong");
      // Debug: error
      // eslint-disable-next-line no-console
      console.error("[UploadReceipt] submit error", err);
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-xl font-semibold text-foreground">提交成功</p>
        <p className="text-base text-muted-foreground mt-1">Submitted Successfully</p>
        <p className="text-base text-foreground mt-6">报销单已提交</p>
        <p className="text-sm text-muted-foreground mt-0.5">Receipt submitted</p>
        <p className="text-base text-foreground mt-4">等待审核</p>
        <p className="text-sm text-muted-foreground mt-0.5">Waiting for approval</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetForm}
          className="mt-10 w-full max-w-sm"
        >
          再提交一张 / Upload Another
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-20">
      <h1 className="text-xl font-semibold text-foreground">Worker Receipt Upload</h1>
      <p className="text-base text-muted-foreground mt-1">上传报销单 · Upload Expense Receipt</p>
      <p className="text-sm text-muted-foreground mt-4">请拍照上传发票</p>
      <p className="text-xs text-muted-foreground">Upload your receipt photo</p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
        <div>
          <Label zh="工人姓名" en="Worker Name" />
          <Select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            required
            className="text-base px-4 min-h-12"
          >
            <option value="">请选择 / Select</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label zh="工地" en="Project" />
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="text-base px-4 min-h-12"
          >
            <option value="">请选择 / Optional</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label zh="开销类型" en="Expense Type" />
          <Select
            value={expenseType}
            onChange={(e) => setExpenseType(e.target.value)}
            className="text-base px-4 min-h-12"
          >
            {EXPENSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.zh} / {o.en}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label zh="报销日期" en="Receipt Date" />
          <Input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
            className={`h-12 text-base rounded-lg px-4 ${
              ocrFieldConfidence && ocrFieldConfidence.date !== "high" ? "border-amber-500/55" : ""
            }`}
          />
        </div>

        <div>
          <Label zh="商家" en="Vendor" />
          <Input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="商家名称"
            className={`h-12 text-base rounded-lg px-4 ${
              ocrFieldConfidence && ocrFieldConfidence.vendor !== "high"
                ? "border-amber-500/55"
                : ""
            }`}
          />
        </div>

        <div>
          <Label zh="金额" en="Amount" />
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={`h-12 text-base rounded-lg px-4 ${
              ocrFieldConfidence && ocrFieldConfidence.amount !== "high"
                ? "border-amber-500/55"
                : ""
            }`}
            required
          />
        </div>

        <div>
          <Label zh="发票照片" en="Receipt Photo" />
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full min-h-[64px] rounded-sm border border-dashed border-[#E5E7EB] bg-background px-4 py-4 text-center text-base text-muted-foreground dark:border-border"
          >
            {file ? (
              <span className="text-foreground font-medium">{file.name}</span>
            ) : (
              <>
                <span className="text-lg">📷</span>
                <span className="block mt-1">拍照上传</span>
                <span className="block text-sm">Take Photo</span>
              </>
            )}
          </button>

          {ocrBusy ? (
            <p className="mt-2 text-sm text-muted-foreground">识别中… / Recognizing receipt…</p>
          ) : null}

          {ocrSuggestions &&
          ocrFieldConfidence &&
          (ocrFieldConfidence.vendor !== "high" ||
            ocrFieldConfidence.amount !== "high" ||
            ocrFieldConfidence.date !== "high") ? (
            <div className="mt-2 rounded-sm border border-amber-500/45 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
              <p className="font-medium text-amber-900 dark:text-amber-50">
                OCR 建议核对 · Please verify OCR
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {ocrFieldConfidence.vendor !== "high" && ocrSuggestions.vendor ? (
                  <li>商家 Vendor: {ocrSuggestions.vendor}</li>
                ) : null}
                {ocrFieldConfidence.amount !== "high" && ocrSuggestions.amount ? (
                  <li>金额 Amount: {ocrSuggestions.amount}</li>
                ) : null}
                {ocrFieldConfidence.date !== "high" && ocrSuggestions.date ? (
                  <li>日期 Date: {ocrSuggestions.date}</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {process.env.NODE_ENV !== "production" && ocrMatchedRules.length > 0 ? (
            <details className="mt-2 rounded-sm border border-border/60 px-3 py-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                OCR Debug ({ocrSource}) - amount diagnostics
              </summary>
              <AmountDiagnosticsPanel
                className="mt-2"
                diagnostics={ocrAmountDiagnostics}
                matchedRules={ocrMatchedRules}
              />
            </details>
          ) : null}

          {previewUrl ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="shrink-0 rounded-md border border-border/70 overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    className="w-32 h-24 object-cover rounded-md"
                  />
                </button>
                <div className="flex-1 text-xs text-muted-foreground">
                  <p>轻点预览可放大查看 / Tap to enlarge</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1"
                  onClick={() => {
                    setFile(null);
                    setOcrFieldConfidence(null);
                    setOcrSuggestions(null);
                    setOcrDetectedSnapshot(null);
                    setOcrSource("none");
                    setOcrMatchedRules([]);
                    setOcrAmountDiagnostics([]);
                    setPreviewUrl((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  移除 / Remove
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1"
                  onClick={() => inputRef.current?.click()}
                >
                  更换 / Replace
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <Label zh="备注" en="Notes (optional)" />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="选填"
            className="h-12 text-base rounded-lg px-4"
          />
        </div>

        {message && (
          <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-center text-sm text-destructive">
            {message}
          </div>
        )}

        <Button
          type="submit"
          className="mt-2 w-full min-h-12 text-base font-medium sm:min-h-10"
          disabled={uploading || submitting || ocrBusy}
        >
          {uploading ? "上传中…" : submitting ? "提交中…" : "提交报销 / Submit Receipt"}
        </Button>
      </form>
      <Dialog open={previewOpen && !!previewUrl} onOpenChange={(open) => setPreviewOpen(open)}>
        <DialogContent className="max-w-full sm:max-w-lg p-0">
          {previewUrl ? (
            <div className="w-full max-h-[80vh] flex items-center justify-center bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Receipt full preview"
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
