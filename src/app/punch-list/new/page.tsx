import { redirect } from "next/navigation";

/** FAB link: New Punch Issue → redirect to punch list (use + Add Issue there). */
export default function PunchListNewPage() {
  redirect("/punch-list");
}
