"use client";
import { Button } from "@/components/ui/button";
import { LoadingState, SystemState } from "@/components/ui/system-state";
export function LaborReadState({
  title,
  busy,
  retry,
}: {
  title: string;
  busy?: boolean;
  retry: () => void;
}) {
  return (
    <div className="page-container py-6" data-labor-read-state>
      {busy ? (
        <LoadingState text={`Loading ${title.toLowerCase()}…`} />
      ) : (
        <SystemState
          title={`${title} unavailable`}
          description="The latest records could not be confirmed. Try again."
          tone="danger"
          action={
            <Button className="min-h-11" variant="outline" onClick={retry}>
              Try again
            </Button>
          }
        />
      )}
    </div>
  );
}
