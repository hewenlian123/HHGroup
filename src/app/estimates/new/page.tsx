import { getCostCodes } from "@/lib/data";
import { NewEstimateEditor } from "./new-estimate-editor";

export const dynamic = "force-dynamic";

export default function NewEstimatePage() {
  const costCodes = getCostCodes();
  return (
    <div className="estimate-builder-page page-stack py-3 md:py-4">
      <NewEstimateEditor costCodes={costCodes} />
    </div>
  );
}
