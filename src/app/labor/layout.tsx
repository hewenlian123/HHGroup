import { ensureConstructionSchema } from "@/lib/ensure-construction-schema";

export default async function LaborLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureConstructionSchema();
  return <>{children}</>;
}
