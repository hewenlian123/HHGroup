import { redirect } from "next/navigation";

/** Redirect /vendors to financial vendors page. */
export default function VendorsRedirectPage() {
  redirect("/financial/vendors");
}
