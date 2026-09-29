export type UploadProgress = {
  index: number;
  phase: "waiting" | "uploading" | "done" | "failed";
};

/** Bounded parallel uploads so a 50-file drop does not open 50 requests at once. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (progress: UploadProgress) => void
): Promise<R[]> {
  const size = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let cursor = 0;
  items.forEach((_, index) => onProgress?.({ index, phase: "waiting" }));

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index]!;
      onProgress?.({ index, phase: "uploading" });
      try {
        results[index] = await worker(item, index);
        onProgress?.({ index, phase: "done" });
      } catch (error) {
        onProgress?.({ index, phase: "failed" });
        throw error;
      }
    }
  }

  const workers = Array.from({ length: Math.min(size, items.length) }, () => run());
  await Promise.all(workers);
  return results;
}
