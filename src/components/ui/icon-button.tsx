import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "children" | "size"> {
  "aria-label": string;
  children: React.ReactNode;
}

/** Icon-only action with an enforced accessible name and touch target. */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, ...props }, ref) => (
    <Button ref={ref} size="icon" {...props}>
      {children}
    </Button>
  )
);
IconButton.displayName = "IconButton";

export { IconButton };
