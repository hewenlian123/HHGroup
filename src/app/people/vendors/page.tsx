import { redirect } from "next/navigation";

/** Redirect /people/vendors to financial vendors page. */
export default function PeopleVendorsRedirectPage() {
  redirect("/financial/vendors");
}
