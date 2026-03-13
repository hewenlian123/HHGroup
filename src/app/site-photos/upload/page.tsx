import { redirect } from "next/navigation";

/** FAB link: Upload Photo → redirect to site photos (use upload there). */
export default function SitePhotosUploadPage() {
  redirect("/site-photos");
}
