import { getCostCodes } from "@/lib/data";
import { NewEstimateEditor } from "./new-estimate-editor";

export const dynamic = "force-dynamic";

export default function NewEstimatePage() {
  const costCodes = getCostCodes();
  return (
    <div className="page-container page-stack py-6">
      <NewEstimateEditor costCodes={costCodes} />
    </div>
  );
}
