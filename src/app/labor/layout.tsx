import { ensureConstructionSchema } from "@/lib/ensure-construction-schema";

export default function LaborLayout({ children }: { children: React.ReactNode }) {
  void ensureConstructionSchema();
  return <>{children}</>;
}
