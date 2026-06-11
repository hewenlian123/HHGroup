export const INBOX_DRAFT_OCR_WRITEBACK_EVENT = "hh:expense-inbox-draft-ocr-writeback";

export type InboxDraftOcrWritebackEventDetail = {
  expenseId: string;
  ok: boolean;
  message?: string;
  changedFields?: string[];
};

export function notifyInboxDraftOcrWriteback(detail: InboxDraftOcrWritebackEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INBOX_DRAFT_OCR_WRITEBACK_EVENT, { detail }));
}
