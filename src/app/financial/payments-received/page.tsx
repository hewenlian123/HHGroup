import { redirect } from "next/navigation";

/** Redirect legacy route to main payments page. */
export default function PaymentsReceivedPage() {
  redirect("/financial/payments");
}
