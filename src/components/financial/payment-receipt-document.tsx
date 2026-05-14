import { PaymentReceiptBody } from "@/components/financial/payment-receipt-body";
import type { PaymentReceiptPreviewDto } from "@/lib/payment-receipt-preview-dto";

export function PaymentReceiptDocument({ data }: { data: PaymentReceiptPreviewDto }) {
  return <PaymentReceiptBody data={data} />;
}
