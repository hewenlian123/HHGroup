import { ReactNode } from "react";
import { Toolbar } from "@/components/ui/toolbar";

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Toolbar variant="filters" className={className}>
      {children}
    </Toolbar>
  );
}
