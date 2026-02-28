"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function AddLineItemButton({
  addLineItemAction,
  estimateId,
  costCode,
}: {
  addLineItemAction: (formData: FormData) => Promise<void>;
  estimateId: string;
  costCode: string;
}) {
  return (
    <form action={addLineItemAction} className="inline-block">
      <input type="hidden" name="estimateId" value={estimateId} />
      <input type="hidden" name="costCode" value={costCode} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add line item
      </Button>
    </form>
  );
}
