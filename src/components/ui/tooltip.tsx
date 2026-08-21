"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

type TooltipContextValue = {
  contentId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltip() {
  const context = React.useContext(TooltipContext);
  if (!context) throw new Error("Tooltip components must be used inside Tooltip");
  return context;
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({
  children,
  defaultOpen = false,
  onOpenChange,
  open: controlledOpen,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const contentId = React.useId();
  const triggerRef = React.useRef<HTMLElement>(null);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  return (
    <TooltipContext.Provider value={{ contentId, open, setOpen, triggerRef }}>
      {children}
    </TooltipContext.Provider>
  );
}

export const TooltipTrigger = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { asChild?: boolean }
>(({ asChild = false, onBlur, onFocus, onPointerEnter, onPointerLeave, ...props }, ref) => {
  const { contentId, open, setOpen, triggerRef } = useTooltip();
  const Comp = asChild ? Slot : "button";
  const setRefs = (node: HTMLElement | null) => {
    triggerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <Comp
      ref={setRefs}
      aria-describedby={open ? contentId : undefined}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        setOpen(true);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        setOpen(false);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        setOpen(true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        setOpen(false);
      }}
      {...props}
    />
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

export function TooltipContent({
  children,
  className,
  side = "top",
  sideOffset = 8,
}: {
  children: React.ReactNode;
  className?: string;
  side?: "top" | "bottom";
  sideOffset?: number;
}) {
  const { contentId, open, triggerRef } = useTooltip();
  const [mounted, setMounted] = React.useState(false);
  const [position, setPosition] = React.useState({ left: 0, top: 0 });

  React.useEffect(() => setMounted(true), []);
  React.useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width / 2)),
        top: side === "top" ? rect.top - sideOffset : rect.bottom + sideOffset,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, side, sideOffset, triggerRef]);

  if (!mounted || !open) return null;
  return createPortal(
    <div
      id={contentId}
      role="tooltip"
      className={cn(
        "pointer-events-none fixed z-[200] max-w-64 rounded-hh-compact border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] px-hh-2 py-hh-1 text-[var(--neo-text-primary)] shadow-floating",
        TYPO.metadata,
        className
      )}
      style={{
        left: position.left,
        top: position.top,
        transform: side === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
    >
      {children}
    </div>,
    document.body
  );
}
