import { redirect } from "next/navigation";

export default function DailyLaborLogPage() {
  redirect("/labor?addDaily=1");
}
