import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";

export type PaymentReceiptPreviewDto = {
  company: DocumentCompanyProfileDTO;
  receiptNo: string;
  recipientEmail: string | null;
  payment: {
    id: string;
    paymentDate: string;
    amount: number;
    paymentMethod: string | null;
    depositAccount: string | null;
    notes: string | null;
  };
  invoice: {
    id: string;
    invoiceNo: string | null;
    total: number;
    balanceAfterPayment: number;
  };
  customerName: string;
  projectName: string | null;
};
