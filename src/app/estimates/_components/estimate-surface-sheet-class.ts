import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";

export type EstimateSurfaceSheetKind =
  | "information"
  | "pricing"
  | "notes"
  | "payment"
  | "revision"
  | "activity";

const SURFACE_WIDTH_CLASS: Record<EstimateSurfaceSheetKind, string> = {
  information: "md:!w-[440px] md:!max-w-[440px]",
  pricing: "md:!w-[400px] md:!max-w-[400px]",
  notes: "md:!w-[480px] md:!max-w-[480px]",
  payment: "md:!w-[700px] md:!max-w-[700px]",
  revision: "md:!w-[440px] md:!max-w-[440px]",
  activity: "md:!w-[400px] md:!max-w-[400px]",
};

export function estimateSurfaceSheetClassName(
  surface: EstimateSurfaceSheetKind,
  className?: string
): string {
  return cn(
    EB.sheetGlass,
    "eb-estimate-surface-sheet flex max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden p-0 max-md:!inset-0 max-md:!h-[100dvh] max-md:!max-h-[100dvh] max-md:!w-full max-md:!max-w-none max-md:!rounded-none",
    SURFACE_WIDTH_CLASS[surface],
    className
  );
}
