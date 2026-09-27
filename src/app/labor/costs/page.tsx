import { Suspense } from "react";
import { LaborCosts } from "../workspace-client";
export default function LaborCostsPage() {
  return (
    <Suspense fallback={null}>
      <LaborCosts />
    </Suspense>
  );
}
