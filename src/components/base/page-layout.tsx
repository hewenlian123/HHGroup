"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page-level title and optional description. */
export function PageHeader({
  title,
  description,
  children,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Right-side actions (rendered in header). Alias for children for compatibility. */
  actions?: ReactNode;
  className?: string;
}) {
  const rightContent = children ?? actions;
  return (
    <header className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[#111827]">{title}</h1>
          {description ? <p className="mt-0.5 text-xs text-[#9CA3AF]">{description}</p> : null}
        </div>
        {rightContent}
      </div>
    </header>
  );
}

/** Horizontal divider using design tokens (border only). */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("ui-divider border-b border-[#E5E7EB]", className)} />;
}

/** Bar for primary page actions (left/right slots). Uses Phase 1 layout. */
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
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-[#E5E7EB] pb-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {children ?? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">{left}</div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">{right}</div>
        </>
      )}
    </div>
  );
}

/** Main content wrapper for page body (no card, no heavy shadow). */
export function MainContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-1 flex-col gap-4", className)}>{children}</div>;
}

/** Composes PageHeader, optional ActionBar, Divider, and MainContent for a consistent page shell. */
export function PageLayout({
  header,
  actionBar,
  children,
  className,
  divider = true,
}: {
  header: ReactNode;
  actionBar?: ReactNode;
  children: ReactNode;
  className?: string;
  /** When false, skip the horizontal rule under the header (e.g. custom hero + tabs). */
  divider?: boolean;
}) {
  return (
    <div className={cn("page-container page-stack flex flex-col", className)}>
      {header}
      {actionBar}
      {divider ? <Divider /> : null}
      <MainContent>{children}</MainContent>
    </div>
  );
}
