import { redirect } from "next/navigation";

export default function BackupsRedirectPage() {
  redirect("/system/backups");
}
