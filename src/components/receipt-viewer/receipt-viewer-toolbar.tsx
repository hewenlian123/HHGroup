"use client";

import type * as React from "react";
import {
  Download,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  RotateCw,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineLoading } from "@/components/ui/skeleton";
import type { ReceiptViewerCanvasHandle, ReceiptViewerTransformState } from "./types";
import { cn } from "@/lib/utils";

type ToolButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function ToolButton({ label, onClick, disabled = false, children }: ToolButtonProps) {
  return (
    <span className="group/tool relative inline-flex shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className="h-11 w-11 min-w-11 touch-manipulation rounded-lg border border-transparent text-[var(--neo-canvas-text-secondary)] hover:border-white/10 hover:bg-white/[0.07] hover:text-[var(--neo-canvas-text-primary)] active:bg-white/10 focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] disabled:opacity-35 lg:h-9 lg:w-9 lg:min-w-9 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.8]"
      >
        {children}
      </Button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[var(--neo-graphite-950)] px-2 py-1 text-[10px] font-medium text-[var(--neo-canvas-text-primary)] opacity-0 shadow-lg transition-opacity duration-150 group-hover/tool:opacity-100 group-focus-within/tool:opacity-100 lg:block"
      >
        {label}
      </span>
    </span>
  );
}

export function ReceiptViewerHeaderActions({
  onDownload,
  onClose,
  downloadBusy,
  downloadDisabled,
}: {
  onDownload: () => void;
  onClose: () => void;
  downloadBusy: boolean;
  downloadDisabled: boolean;
}) {
  const headerAction =
    "min-h-11 touch-manipulation rounded-lg border border-transparent px-2.5 text-[var(--neo-canvas-text-secondary)] hover:border-white/10 hover:bg-white/[0.07] hover:text-[var(--neo-canvas-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] lg:min-h-9 lg:px-3";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={headerAction}
        aria-label="Download receipt"
        disabled={downloadDisabled || downloadBusy}
        onClick={onDownload}
      >
        {downloadBusy ? (
          <InlineLoading size="sm" aria-label="Downloading" />
        ) : (
          <Download className="mr-1.5 h-4 w-4" aria-hidden />
        )}
        <span className="hidden sm:inline">Download</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={headerAction}
        aria-label="Close"
        onClick={onClose}
      >
        <X className="mr-1.5 h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Close</span>
      </Button>
    </div>
  );
}

export function ReceiptViewerToolbar({
  controls,
  state,
  className,
  trailing,
}: {
  controls: React.RefObject<ReceiptViewerCanvasHandle | null>;
  state: ReceiptViewerTransformState;
  className?: string;
  trailing?: React.ReactNode;
}) {
  const disabled = !state.ready;

  return (
    <footer
      data-testid="receipt-viewer-toolbar"
      className={cn(
        "flex h-[calc(52px+env(safe-area-inset-bottom))] min-h-[52px] shrink-0 items-start justify-center overflow-hidden border-t border-white/10 bg-[rgb(24_27_30_/_0.96)] px-2 pb-[env(safe-area-inset-bottom)]",
        className
      )}
    >
      <div
        data-testid="receipt-viewer-toolbar-controls"
        className="flex h-[52px] min-w-0 max-w-full items-center justify-center gap-1"
      >
        <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
          <ToolButton
            label="Rotate left"
            disabled={disabled}
            onClick={() => controls.current?.rotateLeft()}
          >
            <RotateCcw aria-hidden />
          </ToolButton>
          <ToolButton
            label="Rotate right"
            disabled={disabled}
            onClick={() => controls.current?.rotateRight()}
          >
            <RotateCw aria-hidden />
          </ToolButton>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <ToolButton
            label="Zoom out"
            disabled={disabled || state.zoomPercent <= 100}
            onClick={() => controls.current?.zoomOut()}
          >
            <Minus aria-hidden />
          </ToolButton>
          <output
            aria-label={`Current zoom ${state.zoomPercent}%`}
            className="w-11 shrink-0 text-center text-xs font-medium tabular-nums text-[var(--neo-canvas-text-secondary)] sm:w-12"
          >
            {state.zoomPercent}%
          </output>
          <ToolButton
            label="Zoom in"
            disabled={disabled || state.zoomPercent >= 500}
            onClick={() => controls.current?.zoomIn()}
          >
            <Plus aria-hidden />
          </ToolButton>
        </div>

        <ToolButton
          label="Fit to screen"
          disabled={disabled}
          onClick={() => controls.current?.fit()}
        >
          <Maximize2 aria-hidden />
        </ToolButton>
        <span className="hidden sm:inline-flex">
          <ToolButton
            label="Reset view"
            disabled={disabled}
            onClick={() => controls.current?.reset()}
          >
            <Undo2 aria-hidden />
          </ToolButton>
        </span>

        {trailing ? (
          <>
            <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-white/10" />
            <div className="flex shrink-0 items-center opacity-80 transition-opacity hover:opacity-100 focus-within:opacity-100">
              {trailing}
            </div>
          </>
        ) : null}

        <div className="shrink-0 sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More receipt tools"
                className="h-11 w-11 min-w-11 touch-manipulation rounded-lg border border-transparent text-[var(--neo-canvas-text-secondary)] hover:border-white/10 hover:bg-white/[0.07] hover:text-[var(--neo-canvas-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.8]"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="end"
              sideOffset={8}
              className="z-[10001] min-w-48 border-white/10 bg-[var(--neo-graphite-900)]"
            >
              <DropdownMenuItem
                disabled={disabled}
                onSelect={() => controls.current?.rotateLeft()}
                className="min-h-11"
              >
                <RotateCcw aria-hidden />
                Rotate left
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={disabled}
                onSelect={() => controls.current?.rotateRight()}
                className="min-h-11"
              >
                <RotateCw aria-hidden />
                Rotate right
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={disabled}
                onSelect={() => controls.current?.reset()}
                className="min-h-11"
              >
                <Undo2 aria-hidden />
                Reset view
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </footer>
  );
}
