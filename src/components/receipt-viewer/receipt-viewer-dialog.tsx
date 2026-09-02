"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReceiptViewerMetadata } from "./receipt-viewer-metadata";
import { ReceiptViewerHeaderActions, ReceiptViewerToolbar } from "./receipt-viewer-toolbar";
import type {
  ReceiptViewerCanvasHandle,
  ReceiptViewerMetadata as ReceiptViewerMetadataValue,
  ReceiptViewerTransformState,
} from "./types";
import { cn } from "@/lib/utils";
import { useHhPortalContainer } from "@/contexts/hh-theme-context";

const RECEIPT_VIEWER_DESCRIPTION =
  "Review the authorized receipt image and its existing expense details.";

export type ReceiptViewerDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  returnFocusTarget?: HTMLElement | null;
  fileName: string;
  attachmentLabel?: string | null;
  metadata: ReceiptViewerMetadataValue;
  media: React.ReactNode;
  controls: React.RefObject<ReceiptViewerCanvasHandle | null>;
  transformState: ReceiptViewerTransformState;
  onDownload: () => void;
  downloadBusy: boolean;
  downloadDisabled: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  footerTrailing?: React.ReactNode;
};

export function ReceiptViewerDialog({
  isOpen,
  onClose,
  returnFocusTarget,
  fileName,
  attachmentLabel,
  metadata,
  media,
  controls,
  transformState,
  onDownload,
  downloadBusy,
  downloadDisabled,
  onPrevious,
  onNext,
  footerTrailing,
}: ReceiptViewerDialogProps) {
  const portalContainer = useHhPortalContainer();
  const reducedMotion = useReducedMotion();

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if ((event.key === "+" || event.key === "=") && transformState.ready) {
        event.preventDefault();
        controls.current?.zoomIn();
      } else if (event.key === "-" && transformState.ready) {
        event.preventDefault();
        controls.current?.zoomOut();
      } else if (event.key === "0" && transformState.ready) {
        event.preventDefault();
        controls.current?.reset();
      } else if (event.key === "ArrowLeft" && onPrevious && !transformState.zoomed) {
        event.preventDefault();
        onPrevious();
      } else if (event.key === "ArrowRight" && onNext && !transformState.zoomed) {
        event.preventDefault();
        onNext();
      }
    },
    [controls, onNext, onPrevious, transformState.ready, transformState.zoomed]
  );

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal container={portalContainer ?? undefined} forceMount>
        <div className="contents">
          <AnimatePresence>
            {isOpen ? (
              <motion.div
                key="receipt-viewer-presence"
                className="pointer-events-none fixed inset-0 z-[9998]"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0.08 : 0.16, ease: "easeOut" }}
              >
                <DialogPrimitive.Overlay asChild forceMount>
                  <motion.div
                    key="receipt-viewer-overlay"
                    className="pointer-events-auto fixed inset-0 z-[9998] bg-[var(--hh-overlay-scrim)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0.08 : 0.18, ease: "easeOut" }}
                  />
                </DialogPrimitive.Overlay>
                <DialogPrimitive.Content
                  asChild
                  forceMount
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    returnFocusTarget?.focus({ preventScroll: true });
                  }}
                >
                  <motion.div
                    key="receipt-viewer-content"
                    data-attachment-preview-modal
                    data-receipt-viewer
                    data-hh-context="viewer"
                    data-hh-theme="operational-light"
                    aria-modal="true"
                    data-reduced-motion={reducedMotion ? "true" : "false"}
                    className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center p-0 outline-none sm:p-3 lg:p-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: reducedMotion ? 0.08 : 0.16,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    onKeyDown={handleKeyDown}
                    onPointerDown={(event) => {
                      if (event.target === event.currentTarget) onClose();
                    }}
                  >
                    <motion.section
                      data-receipt-viewer-shell
                      className={cn(
                        "relative flex h-[100dvh] w-screen flex-col overflow-hidden rounded-none border-y-0 border-[var(--hh-border)] bg-[var(--hh-l1-workspace)] text-[var(--hh-text-primary)] shadow-task",
                        "sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)] sm:rounded-[18px] sm:border",
                        "lg:h-[min(860px,calc(100dvh-48px))] lg:w-[min(1180px,calc(100vw-48px))] lg:rounded-[20px]"
                      )}
                      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.99, y: 6 }}
                      transition={{
                        duration: reducedMotion ? 0.08 : 0.22,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <header className="flex min-h-[60px] shrink-0 items-center gap-3 border-b border-[var(--hh-border)] bg-[var(--hh-l1-workspace)] px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
                        <div className="min-w-0 flex-1">
                          <DialogPrimitive.Title className="text-base font-semibold tracking-[-0.01em] text-[var(--hh-text-primary)]">
                            Receipt preview
                          </DialogPrimitive.Title>
                          <p
                            className="truncate text-xs text-[var(--hh-text-tertiary)]"
                            title={fileName}
                          >
                            {fileName}
                            {attachmentLabel ? ` · ${attachmentLabel}` : ""}
                          </p>
                          <DialogPrimitive.Description className="sr-only">
                            {RECEIPT_VIEWER_DESCRIPTION}
                          </DialogPrimitive.Description>
                        </div>
                        <ReceiptViewerHeaderActions
                          onDownload={onDownload}
                          onClose={onClose}
                          downloadBusy={downloadBusy}
                          downloadDisabled={downloadDisabled}
                        />
                      </header>

                      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
                        <div
                          data-hh-context="evidence"
                          data-hh-theme="document-light"
                          className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[var(--hh-l2-operational-surface)] p-2 sm:p-3"
                        >
                          {onPrevious ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Previous attachment"
                              onClick={onPrevious}
                              className="absolute left-3 top-1/2 z-20 h-11 w-11 -translate-y-1/2 touch-manipulation border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] text-[var(--hh-text-primary)] shadow-floating hover:bg-[var(--hh-l3-hover)]"
                            >
                              <ChevronLeft className="h-5 w-5" aria-hidden />
                            </Button>
                          ) : null}
                          {media}
                          {onNext ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Next attachment"
                              onClick={onNext}
                              className="absolute right-3 top-1/2 z-20 h-11 w-11 -translate-y-1/2 touch-manipulation border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] text-[var(--hh-text-primary)] shadow-floating hover:bg-[var(--hh-l3-hover)]"
                            >
                              <ChevronRight className="h-5 w-5" aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                        <ReceiptViewerMetadata metadata={metadata} />
                      </div>

                      <div className="lg:hidden">
                        <ReceiptViewerMetadata metadata={metadata} mobile />
                      </div>
                      <ReceiptViewerToolbar
                        controls={controls}
                        state={transformState}
                        trailing={footerTrailing}
                      />
                    </motion.section>
                  </motion.div>
                </DialogPrimitive.Content>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
