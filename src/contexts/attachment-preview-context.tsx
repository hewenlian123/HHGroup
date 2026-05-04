"use client";

import * as React from "react";
import {
  AttachmentPreviewModal,
  inferAttachmentPreviewType,
  type AttachmentPreviewFileItem,
  type AttachmentPreviewFileType,
} from "@/components/attachment-preview-modal";

const RESET_DELAY_MS = 160;

export type { AttachmentPreviewFileItem };

type SessionOptions = {
  isLoading?: boolean;
  onIndexChange?: (index: number) => void;
  onDownload?: () => void | Promise<void>;
  downloadBusy?: boolean;
  showReplace?: boolean;
  replaceInputRef?: React.Ref<HTMLInputElement>;
  onReplaceInputChange?: React.ChangeEventHandler<HTMLInputElement>;
  onReplaceClick?: () => void;
  replaceBusy?: boolean;
  replaceAccept?: string;
  extraFooter?: React.ReactNode;
  onClosed?: () => void;
  /** Re-sign or re-resolve preview URL after HTTP 403/404 (receipt flows). */
  onRefreshPreviewUrl?: () => Promise<string | null>;
  /** Edit Expense: delete current attachment by id (modal only shows control when slide has `attachmentId`). */
  onDeleteCurrent?: (attachmentId: string) => Promise<void>;
  /** Retry resolving signed URLs after initial batch failure (receipt flows). */
  onRetrySignedUrlResolve?: () => void;
};

export type AttachmentPreviewOpenMultiPayload = SessionOptions & {
  files: AttachmentPreviewFileItem[];
  initialIndex?: number;
};

export type AttachmentPreviewOpenSinglePayload = SessionOptions & {
  url: string;
  fileName?: string;
  fileType?: AttachmentPreviewFileType;
  unsupported?: boolean;
  mimeType?: string;
};

export type AttachmentPreviewOpenPayload =
  | AttachmentPreviewOpenMultiPayload
  | AttachmentPreviewOpenSinglePayload;

/** Fields that `patchPreview` may update while the modal is open. */
export type AttachmentPreviewPatch = Partial<SessionOptions> & {
  files?: AttachmentPreviewFileItem[];
  initialIndex?: number;
  currentIndex?: number;
  url?: string;
  fileName?: string;
  fileType?: AttachmentPreviewFileType;
  unsupported?: boolean;
  mimeType?: string;
};

function isMultiPayload(p: AttachmentPreviewOpenPayload): p is AttachmentPreviewOpenMultiPayload {
  return Array.isArray((p as AttachmentPreviewOpenMultiPayload).files);
}

function normalizeFileItem(
  f: AttachmentPreviewFileItem,
  fallbackName: string
): AttachmentPreviewFileItem {
  const fileName = f.fileName ?? fallbackName;
  const fileType = f.fileType ?? inferAttachmentPreviewType(fileName, f.url);
  return { ...f, fileName, fileType, mimeType: f.mimeType };
}

type ModalState = {
  isOpen: boolean;
  files: AttachmentPreviewFileItem[];
  currentIndex: number;
  sessionIsLoading: boolean;
  onIndexChange?: (index: number) => void;
  onDownload?: () => void | Promise<void>;
  downloadBusy: boolean;
  showReplace: boolean;
  replaceInputRef?: React.Ref<HTMLInputElement>;
  onReplaceInputChange?: React.ChangeEventHandler<HTMLInputElement>;
  onReplaceClick?: () => void;
  replaceBusy: boolean;
  replaceAccept: string;
  extraFooter?: React.ReactNode;
  onRefreshPreviewUrl?: () => Promise<string | null>;
  onDeleteCurrent?: (attachmentId: string) => Promise<void>;
  onRetrySignedUrlResolve?: () => void;
};

function emptyModalState(): ModalState {
  return {
    isOpen: false,
    files: [],
    currentIndex: 0,
    sessionIsLoading: false,
    downloadBusy: false,
    showReplace: false,
    replaceBusy: false,
    replaceAccept: "image/*,.pdf,application/pdf",
  };
}

function applySessionOptions(
  base: ModalState,
  s: SessionOptions,
  onClosedRef: React.MutableRefObject<(() => void) | undefined>
): void {
  if (s.isLoading !== undefined) base.sessionIsLoading = s.isLoading;
  if (s.onIndexChange !== undefined) base.onIndexChange = s.onIndexChange;
  if (s.onDownload !== undefined) base.onDownload = s.onDownload;
  if (s.downloadBusy !== undefined) base.downloadBusy = s.downloadBusy;
  if (s.showReplace !== undefined) base.showReplace = s.showReplace;
  if (s.replaceInputRef !== undefined) base.replaceInputRef = s.replaceInputRef;
  if (s.onReplaceInputChange !== undefined) base.onReplaceInputChange = s.onReplaceInputChange;
  if (s.onReplaceClick !== undefined) base.onReplaceClick = s.onReplaceClick;
  if (s.replaceBusy !== undefined) base.replaceBusy = s.replaceBusy;
  if (s.replaceAccept !== undefined) base.replaceAccept = s.replaceAccept;
  if (s.extraFooter !== undefined) base.extraFooter = s.extraFooter;
  if (s.onClosed !== undefined) onClosedRef.current = s.onClosed;
  if (s.onRefreshPreviewUrl !== undefined) base.onRefreshPreviewUrl = s.onRefreshPreviewUrl;
  if (s.onDeleteCurrent !== undefined) base.onDeleteCurrent = s.onDeleteCurrent;
  if (s.onRetrySignedUrlResolve !== undefined)
    base.onRetrySignedUrlResolve = s.onRetrySignedUrlResolve;
}

type AttachmentPreviewContextValue = {
  isOpen: boolean;
  openPreview: {
    (files: AttachmentPreviewFileItem[], initialIndex?: number, extras?: SessionOptions): void;
    (payload: AttachmentPreviewOpenPayload): void;
  };
  patchPreview: (patch: AttachmentPreviewPatch) => void;
  closePreview: () => void;
};

const AttachmentPreviewContext = React.createContext<AttachmentPreviewContextValue | null>(null);

function GlobalMainImagePreviewOnClick() {
  const { openPreview } = useAttachmentPreview();
  React.useEffect(() => {
    const onClickCapture = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const img = t.closest("img");
      if (!img || !(img instanceof HTMLImageElement)) return;
      const main = document.querySelector("main");
      if (!main || !main.contains(img)) return;
      if (img.closest("[data-no-image-preview],[data-attachment-preview-modal],[role='dialog']")) {
        return;
      }
      if (img.closest("button, a[href]")) return;
      if (img.dataset.noImagePreview === "true" || img.dataset.noPreview === "true") return;
      const rect = img.getBoundingClientRect();
      if (Math.min(rect.width, rect.height) < 44) return;
      const src = (img.currentSrc || img.getAttribute("src") || "").trim();
      if (!src) return;
      e.preventDefault();
      e.stopPropagation();
      const fileName = (img.alt && img.alt.trim()) || "Image";
      openPreview({ url: src, fileName });
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [openPreview]);
  return null;
}

export function AttachmentPreviewProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ModalState>(() => emptyModalState());
  const onClosedRef = React.useRef<(() => void) | undefined>(undefined);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = React.useCallback(() => {
    if (resetTimerRef.current != null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const closePreview = React.useCallback(() => {
    clearResetTimer();
    const cb = onClosedRef.current;
    onClosedRef.current = undefined;
    setState((s) => ({ ...s, isOpen: false }));
    cb?.();
    resetTimerRef.current = setTimeout(() => {
      setState(emptyModalState());
      resetTimerRef.current = null;
    }, RESET_DELAY_MS);
  }, [clearResetTimer]);

  const openPreviewImpl = React.useCallback(
    (payload: AttachmentPreviewOpenPayload) => {
      clearResetTimer();
      let files: AttachmentPreviewFileItem[];
      let currentIndex: number;
      const base: ModalState = {
        ...emptyModalState(),
        isOpen: true,
        replaceAccept: "image/*,.pdf,application/pdf",
      };

      if (isMultiPayload(payload)) {
        onClosedRef.current = payload.onClosed;
        files = (payload.files ?? []).map((f, i) => normalizeFileItem(f, `File ${i + 1}`));
        currentIndex = payload.initialIndex ?? 0;
        if (files.length === 0) {
          files = [{ url: "", fileName: "File", fileType: "image" }];
          currentIndex = 0;
        } else {
          currentIndex = ((currentIndex % files.length) + files.length) % files.length;
        }
        base.files = files;
        base.currentIndex = currentIndex;
        base.sessionIsLoading = payload.isLoading ?? false;
        applySessionOptions(base, payload, onClosedRef);
      } else {
        onClosedRef.current = payload.onClosed;
        const fileName = payload.fileName ?? "File";
        const fileType = payload.fileType ?? inferAttachmentPreviewType(fileName, payload.url);
        files = [
          normalizeFileItem(
            {
              url: payload.url,
              fileName,
              fileType,
              unsupported: payload.unsupported,
              mimeType: payload.mimeType,
            },
            fileName
          ),
        ];
        base.files = files;
        base.currentIndex = 0;
        base.sessionIsLoading = payload.isLoading ?? false;
        applySessionOptions(base, payload, onClosedRef);
      }

      setState(base);
    },
    [clearResetTimer]
  );

  const openPreview = React.useCallback(
    (
      arg0: AttachmentPreviewFileItem[] | AttachmentPreviewOpenPayload,
      arg1?: number | SessionOptions,
      arg2?: SessionOptions
    ) => {
      if (Array.isArray(arg0)) {
        const initialIndex = typeof arg1 === "number" ? arg1 : 0;
        const extras = (typeof arg1 === "number" ? arg2 : arg1) ?? {};
        openPreviewImpl({ files: arg0, initialIndex, ...extras });
        return;
      }
      openPreviewImpl(arg0);
    },
    [openPreviewImpl]
  );

  const patchPreview = React.useCallback((patch: AttachmentPreviewPatch) => {
    setState((s) => {
      if (!s.isOpen) return s;
      const next: ModalState = { ...s };

      if (patch.files !== undefined) {
        next.files = (patch.files ?? []).map((f, i) => normalizeFileItem(f, `File ${i + 1}`));
        if (next.files.length === 0) {
          next.files = [{ url: "", fileName: "File", fileType: "image" }];
          next.currentIndex = 0;
        } else {
          next.currentIndex = Math.min(next.currentIndex, next.files.length - 1);
        }
      }

      if (patch.initialIndex !== undefined) {
        const len = next.files.length || 1;
        next.currentIndex = ((patch.initialIndex % len) + len) % len;
      }

      if (patch.currentIndex !== undefined) {
        const len = next.files.length || 1;
        const ci = patch.currentIndex;
        next.currentIndex = ((ci % len) + len) % len;
      }

      if (patch.url !== undefined && next.files.length > 0) {
        const i = next.currentIndex;
        const cur = next.files[i];
        if (cur) {
          next.files = next.files.map((f, j) => (j === i ? { ...f, url: patch.url! } : f));
        }
      }
      if (patch.fileName !== undefined && next.files.length > 0) {
        const i = next.currentIndex;
        const cur = next.files[i];
        if (cur) {
          next.files = next.files.map((f, j) => (j === i ? { ...f, fileName: patch.fileName } : f));
        }
      }
      if (patch.fileType !== undefined && next.files.length > 0) {
        const i = next.currentIndex;
        const cur = next.files[i];
        if (cur) {
          next.files = next.files.map((f, j) => (j === i ? { ...f, fileType: patch.fileType } : f));
        }
      }
      if (patch.mimeType !== undefined && next.files.length > 0) {
        const i = next.currentIndex;
        const cur = next.files[i];
        if (cur) {
          next.files = next.files.map((f, j) => (j === i ? { ...f, mimeType: patch.mimeType } : f));
        }
      }
      if (patch.unsupported !== undefined && next.files.length > 0) {
        const i = next.currentIndex;
        const cur = next.files[i];
        if (cur) {
          next.files = next.files.map((f, j) =>
            j === i ? { ...f, unsupported: patch.unsupported } : f
          );
        }
      }

      if (patch.isLoading !== undefined) next.sessionIsLoading = patch.isLoading;
      if (patch.onIndexChange !== undefined) next.onIndexChange = patch.onIndexChange;
      if (patch.onDownload !== undefined) next.onDownload = patch.onDownload;
      if (patch.downloadBusy !== undefined) next.downloadBusy = patch.downloadBusy;
      if (patch.showReplace !== undefined) next.showReplace = patch.showReplace;
      if (patch.replaceInputRef !== undefined) next.replaceInputRef = patch.replaceInputRef;
      if (patch.onReplaceInputChange !== undefined)
        next.onReplaceInputChange = patch.onReplaceInputChange;
      if (patch.onReplaceClick !== undefined) next.onReplaceClick = patch.onReplaceClick;
      if (patch.replaceBusy !== undefined) next.replaceBusy = patch.replaceBusy;
      if (patch.replaceAccept !== undefined) next.replaceAccept = patch.replaceAccept;
      if (patch.extraFooter !== undefined) next.extraFooter = patch.extraFooter;
      if (patch.onClosed !== undefined) onClosedRef.current = patch.onClosed;
      if (patch.onRefreshPreviewUrl !== undefined)
        next.onRefreshPreviewUrl = patch.onRefreshPreviewUrl;
      if (patch.onDeleteCurrent !== undefined) next.onDeleteCurrent = patch.onDeleteCurrent;
      if (patch.onRetrySignedUrlResolve !== undefined)
        next.onRetrySignedUrlResolve = patch.onRetrySignedUrlResolve;

      return next;
    });
  }, []);

  React.useEffect(() => () => clearResetTimer(), [clearResetTimer]);

  const setPreviewIndex = React.useCallback((i: number) => {
    setState((s) => {
      if (!s.isOpen || s.files.length === 0) return s;
      const len = s.files.length;
      const idx = ((i % len) + len) % len;
      const syncParent = s.onIndexChange;
      if (syncParent) syncParent(idx);
      return { ...s, currentIndex: idx };
    });
  }, []);

  const value = React.useMemo<AttachmentPreviewContextValue>(
    () => ({
      isOpen: state.isOpen,
      openPreview,
      patchPreview,
      closePreview,
    }),
    [state.isOpen, openPreview, patchPreview, closePreview]
  );

  return (
    <AttachmentPreviewContext.Provider value={value}>
      <GlobalMainImagePreviewOnClick />
      {children}
      <AttachmentPreviewModal
        isOpen={state.isOpen}
        onClose={closePreview}
        files={state.files}
        currentIndex={state.currentIndex}
        onIndexChange={setPreviewIndex}
        sessionIsLoading={state.sessionIsLoading}
        onDownload={state.onDownload}
        downloadBusy={state.downloadBusy}
        showReplace={state.showReplace}
        replaceInputRef={state.replaceInputRef}
        onReplaceInputChange={state.onReplaceInputChange}
        onReplaceClick={state.onReplaceClick}
        replaceBusy={state.replaceBusy}
        replaceAccept={state.replaceAccept}
        extraFooter={state.extraFooter}
        onRefreshPreviewUrl={state.onRefreshPreviewUrl}
        onDeleteCurrent={state.onDeleteCurrent}
        onRetrySignedUrlResolve={state.onRetrySignedUrlResolve}
      />
    </AttachmentPreviewContext.Provider>
  );
}

export function useAttachmentPreview() {
  const ctx = React.useContext(AttachmentPreviewContext);
  if (!ctx) {
    throw new Error("useAttachmentPreview must be used within AttachmentPreviewProvider");
  }
  return ctx;
}

export function useAttachmentPreviewOptional(): AttachmentPreviewContextValue | null {
  return React.useContext(AttachmentPreviewContext);
}
