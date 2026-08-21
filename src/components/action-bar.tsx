import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ActionGroup, Toolbar } from "@/components/ui/toolbar";

export function ActionBar({
  left,
  right,
  children,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Toolbar variant="actions" className={cn("gap-hh-2", className)}>
      {children ?? (
        <>
          <ActionGroup className="min-w-0">{left}</ActionGroup>
          <ActionGroup>{right}</ActionGroup>
        </>
      )}
    </Toolbar>
  );
}
