import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyLaborSubcontractorsPage() {
  // Legacy duplicate route. Canonical subcontractor navigation is `/subcontractors`.
  redirect("/subcontractors");
}
