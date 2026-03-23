import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Single source of truth: Labor → Worker Advances (avoid duplicate nav). */
export default function FinanceAdvancesRedirectPage() {
  redirect("/labor/advances");
}
