import type { SupabaseClient } from "@supabase/supabase-js";
import { findExpenseDuplicate, type ExpenseDuplicateSubject } from "@/lib/expense-duplicate-rules";
import {
  mergeInvoiceExtraction,
  openAiInvoiceContentPart,
  openAiInvoiceOcrPrompt,
  parseInvoiceExtraction,
  type InboxDraftSnapshot,
} from "@/lib/expense-ocr-merge";
import { addCalendarDaysYmd, hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { isInboxUploadExpenseReference } from "@/lib/inbox-upload-constants";
import { normalizeReceiptLocation } from "@/lib/expense-receipt-reference";
import { syncExpenseHeaderAmountFromLinesWithClient } from "@/lib/expenses-db";
import { getServerSupabaseAdminNoStore } from "@/lib/supabase-server";
import type { VendorCandidate } from "@/lib/expense-vendor-match";

const OCR_MODEL = "gpt-4.1-mini";
const MAX_OCR_BYTES = 20 * 1024 * 1024;

type ExpenseOcrRow = {
  id: string;
  created_at?: string | null;
  expense_date?: string | null;
  vendor_name?: string | null;
  vendor?: string | null;
  vendor_id?: string | null;
  status?: string | null;
  reference_no?: string | null;
  due_date?: string | null;
  subtotal?: number | string | null;
  tax_amount?: number | string | null;
  duplicate_expense_id?: string | null;
  duplicate_dismissed_at?: string | null;
  file_sha256?: string | null;
};

type LineRow = { id: string; amount?: number | string | null; total?: number | string | null };

function money(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
}

function isoDay(value: string | null | undefined): string {
  return String(value ?? "").slice(0, 10);
}

async function downloadReceipt(
  userClient: SupabaseClient,
  reference: string
): Promise<{ bytes: Buffer; mimeType: string; fileName: string } | null> {
  const location = normalizeReceiptLocation(reference);
  if (!location) return null;
  const fileName = location.path.split("/").pop() || "invoice";
  const clients = [userClient, getServerSupabaseAdminNoStore()].filter(
    (client): client is SupabaseClient => Boolean(client)
  );
  for (const storage of clients) {
    const { data, error } = await storage.storage.from(location.bucket).download(location.path);
    if (!error && data) {
      const bytes = Buffer.from(await data.arrayBuffer());
      const mimeType =
        data.type || (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      return { bytes, mimeType, fileName };
    }
  }
  return null;
}

async function callOpenAi(input: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  if (input.bytes.byteLength > MAX_OCR_BYTES) {
    throw new Error("This file is too large to OCR. Enter the invoice by hand.");
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: OCR_MODEL,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: openAiInvoiceOcrPrompt() },
            openAiInvoiceContentPart({
              mimeType: input.mimeType,
              base64: input.bytes.toString("base64"),
              fileName: input.fileName,
            }),
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part) =>
              part && typeof part === "object" && "text" in part
                ? String((part as { text?: unknown }).text ?? "")
                : ""
            )
            .join("\n")
        : "";
  if (!text.trim()) throw new Error("Empty OCR response");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("OCR response was not JSON.");
  return JSON.parse(fenced.slice(start, end + 1)) as unknown;
}

async function loadVendors(supabase: SupabaseClient): Promise<VendorCandidate[]> {
  const { data, error } = await supabase.from("vendors").select("id,name").limit(500);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => {
      const record = row as { id?: unknown; name?: unknown };
      return {
        id: typeof record.id === "string" ? record.id : "",
        name: typeof record.name === "string" ? record.name : "",
      };
    })
    .filter((vendor) => vendor.id && vendor.name);
}

async function findDuplicate(
  supabase: SupabaseClient,
  subject: ExpenseDuplicateSubject
): Promise<ReturnType<typeof findExpenseDuplicate>> {
  const columns = "id,vendor_name,vendor,vendor_id,reference_no,total,expense_date";
  const rows: ExpenseDuplicateSubject[] = [];
  const invoice = String(subject.referenceNo ?? "").trim();
  if (invoice && !isInboxUploadExpenseReference(invoice)) {
    const byInvoice = await supabase
      .from("expenses")
      .select(columns)
      .eq("reference_no", invoice)
      .neq("id", subject.id)
      .limit(10);
    if (byInvoice.error) throw new Error(byInvoice.error.message);
    for (const row of byInvoice.data ?? []) rows.push(toSubject(row));
  }
  if (subject.date && subject.total > 0.011) {
    const byDate = await supabase
      .from("expenses")
      .select(columns)
      .gte("expense_date", addCalendarDaysYmd(subject.date, -3))
      .lte("expense_date", addCalendarDaysYmd(subject.date, 3))
      .neq("id", subject.id)
      .limit(80);
    if (byDate.error) throw new Error(byDate.error.message);
    for (const row of byDate.data ?? []) rows.push(toSubject(row));
  }
  return findExpenseDuplicate(subject, rows);
}

function toSubject(row: unknown): ExpenseDuplicateSubject {
  const record = row as {
    id?: string;
    vendor_name?: string | null;
    vendor?: string | null;
    vendor_id?: string | null;
    reference_no?: string | null;
    total?: number | string | null;
    expense_date?: string | null;
  };
  return {
    id: String(record.id ?? ""),
    vendorName: String(record.vendor_name || record.vendor || ""),
    vendorId: record.vendor_id ?? null,
    referenceNo: record.reference_no ?? null,
    total: money(record.total) ?? 0,
    date: isoDay(record.expense_date),
  };
}

async function markOcr(
  supabase: SupabaseClient,
  expenseId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("expenses").update(patch).eq("id", expenseId);
  if (error) throw new Error(error.message);
}

export async function processClaimedInboxOcrJob(
  supabase: SupabaseClient,
  expenseId: string
): Promise<"done" | "failed"> {
  const loaded = await supabase
    .from("expenses")
    .select(
      "id,created_at,expense_date,vendor_name,vendor,vendor_id,status,reference_no,due_date,subtotal,tax_amount,duplicate_expense_id,duplicate_dismissed_at,file_sha256"
    )
    .eq("id", expenseId)
    .maybeSingle();
  if (loaded.error || !loaded.data) {
    await markOcr(supabase, expenseId, {
      ocr_status: "failed",
      ocr_error: loaded.error?.message || "Expense was not found.",
    }).catch(() => undefined);
    return "failed";
  }
  const row = loaded.data as ExpenseOcrRow;
  const status = String(row.status ?? "").toLowerCase();
  if (status && !["draft", "pending", "needs_review", "unreviewed"].includes(status)) {
    await markOcr(supabase, expenseId, { ocr_status: "done", ocr_error: null });
    return "done";
  }

  try {
    const attachment = await supabase
      .from("attachments")
      .select("file_path,file_name,mime_type")
      .eq("entity_type", "expense")
      .eq("entity_id", expenseId)
      .limit(1)
      .maybeSingle();
    const path = (attachment.data as { file_path?: string } | null)?.file_path ?? "";
    const file = path ? await downloadReceipt(supabase, path) : null;
    if (!file) throw new Error("Receipt file could not be read for OCR.");

    const raw = await callOpenAi(file);
    const today = hawaiiTodayYmd();
    const extraction = parseInvoiceExtraction(raw, today);
    if (!extraction) throw new Error("OCR response was not a readable invoice.");

    const lines = await supabase
      .from("expense_lines")
      .select("id,amount,total")
      .eq("expense_id", expenseId)
      .limit(20);
    if (lines.error) throw new Error(lines.error.message);
    const lineRows = (lines.data ?? []) as LineRow[];
    const createdOn = isoDay(row.created_at);
    const snapshot: InboxDraftSnapshot = {
      vendorName: String(row.vendor_name || row.vendor || ""),
      vendorId: row.vendor_id ?? null,
      referenceNo: row.reference_no ?? null,
      expenseDate: isoDay(row.expense_date),
      placeholderDate: createdOn || today,
      createdOn: createdOn || null,
      dueDate: row.due_date ? isoDay(row.due_date) : null,
      subtotal: money(row.subtotal),
      tax: money(row.tax_amount),
      lineAmount: money(lineRows[0]?.amount ?? lineRows[0]?.total),
      lineCount: lineRows.length,
    };
    const vendors = await loadVendors(supabase);
    const merged = mergeInvoiceExtraction(snapshot, extraction, vendors);

    const header: Record<string, unknown> = {
      ocr_status: "done",
      ocr_error: null,
      ocr_confidence: {
        ...merged.confidence,
        attention: merged.attention,
        vendorMatch: merged.vendorMatch.kind,
        applied: merged.applied,
      },
    };
    if (merged.patch.vendorName) {
      header.vendor_name = merged.patch.vendorName;
      header.vendor = merged.patch.vendorName;
    }
    if (merged.patch.vendorId) header.vendor_id = merged.patch.vendorId;
    if (merged.patch.vendorSuggestion !== undefined)
      header.vendor_suggestion = merged.patch.vendorSuggestion;
    if (merged.patch.referenceNo) header.reference_no = merged.patch.referenceNo;
    if (merged.patch.expenseDate) header.expense_date = merged.patch.expenseDate;
    if (merged.patch.dueDate) header.due_date = merged.patch.dueDate;
    if (merged.patch.subtotal != null) header.subtotal = merged.patch.subtotal;
    if (merged.patch.tax != null) header.tax_amount = merged.patch.tax;

    const nextVendor = String(header.vendor_name ?? snapshot.vendorName);
    const nextVendorId = (header.vendor_id as string | null | undefined) ?? snapshot.vendorId;
    const nextReference = String(header.reference_no ?? snapshot.referenceNo ?? "");
    const nextDate = String(header.expense_date ?? snapshot.expenseDate);
    const nextTotal = merged.patch.lineAmount ?? snapshot.lineAmount ?? 0;
    const duplicate = await findDuplicate(supabase, {
      id: expenseId,
      vendorName: nextVendor,
      vendorId: nextVendorId,
      referenceNo: nextReference,
      total: nextTotal,
      date: nextDate,
    });
    const sameDismissed =
      Boolean(row.duplicate_dismissed_at) &&
      row.duplicate_expense_id &&
      duplicate?.expenseId === row.duplicate_expense_id;
    if (!sameDismissed) {
      header.duplicate_expense_id = duplicate?.expenseId ?? null;
      header.duplicate_reason = duplicate?.reason ?? null;
      header.duplicate_dismissed_at = null;
    }

    await markOcr(supabase, expenseId, header);
    if (merged.patch.lineAmount != null && lineRows[0]?.id) {
      const { error } = await supabase
        .from("expense_lines")
        .update({ amount: merged.patch.lineAmount, total: merged.patch.lineAmount })
        .eq("id", lineRows[0].id)
        .eq("expense_id", expenseId);
      if (error) throw new Error(error.message);
      await syncExpenseHeaderAmountFromLinesWithClient(supabase, expenseId, {
        lineId: lineRows[0].id,
        amount: merged.patch.lineAmount,
      });
    }
    return "done";
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR failed.";
    await markOcr(supabase, expenseId, {
      ocr_status: "failed",
      ocr_error: message.slice(0, 400),
    }).catch(() => undefined);
    return "failed";
  }
}

export async function processInboxOcrBatch(
  supabase: SupabaseClient,
  limit = 2
): Promise<{ processed: number; failed: number; remaining: number }> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { processed: 0, failed: 0, remaining: 0 };
  }
  const claimed = await supabase.rpc("claim_expense_ocr_jobs", { p_limit: limit });
  if (claimed.error) {
    if (/claim_expense_ocr_jobs|does not exist|schema cache/i.test(claimed.error.message)) {
      return { processed: 0, failed: 0, remaining: 0 };
    }
    throw new Error(claimed.error.message);
  }
  const ids = (Array.isArray(claimed.data) ? claimed.data : [])
    .map((row) => {
      if (typeof row === "string") return row;
      const record = row as { expense_id?: string };
      return record.expense_id ?? "";
    })
    .filter(Boolean);

  let failed = 0;
  for (const id of ids) {
    const result = await processClaimedInboxOcrJob(supabase, id);
    if (result === "failed") failed += 1;
  }

  const remainingQuery = await supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("inbox_capture", true)
    .in("ocr_status", ["pending", "processing"]);
  return {
    processed: ids.length,
    failed,
    remaining: remainingQuery.count ?? 0,
  };
}

export async function retryInboxOcr(supabase: SupabaseClient, expenseId: string): Promise<void> {
  const { error } = await supabase
    .from("expenses")
    .update({ ocr_status: "pending", ocr_error: null, ocr_claimed_at: null })
    .eq("id", expenseId)
    .in("ocr_status", ["failed", "done", "pending"]);
  if (error) throw new Error(error.message);
}
