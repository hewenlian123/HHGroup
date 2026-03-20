import { revalidatePath } from "next/cache";

/** Detail, preview, and print share data; invalidate all so none stay stale after mutations. */
export function revalidateEstimatePaths(estimateId: string) {
  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath(`/estimates/${estimateId}/preview`);
  revalidatePath(`/estimates/${estimateId}/print`);
}
