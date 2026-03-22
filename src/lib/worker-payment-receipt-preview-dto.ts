import type { WorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";

/** JSON from GET /api/labor/worker-payments/[id]/receipt-preview — mirrors print page inputs. */
export type WorkerPaymentReceiptPreviewDto = {
  /** From `company_profile` (same as print route). */
  company: DocumentCompanyProfileDTO;
  /** Human-readable receipt no. (derived; UUID stays canonical in `payment.id`). */
  receiptNo: string;
  payment: {
    id: string;
    workerId: string;
    projectId: string | null;
    paymentDate: string;
    amount: number;
    paymentMethod: string | null;
    notes: string | null;
  };
  workerName: string;
  projectName: string | null;
  /** Same payload as `getWorkerPaymentReceiptPayload` for the print page; null if unavailable. */
  receipt: WorkerPaymentReceiptPayload | null;
};
