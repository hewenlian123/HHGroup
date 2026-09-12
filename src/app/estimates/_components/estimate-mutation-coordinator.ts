export type EstimateSingleFlightResult<T> = { accepted: true; value: T } | { accepted: false };

export function createEstimateMutationSingleFlight(): {
  isRunning: () => boolean;
  run: <T>(operation: () => Promise<T>) => Promise<EstimateSingleFlightResult<T>>;
} {
  let running = false;

  return {
    isRunning: () => running,
    run: async <T>(operation: () => Promise<T>): Promise<EstimateSingleFlightResult<T>> => {
      if (running) return { accepted: false };
      running = true;
      try {
        return { accepted: true, value: await operation() };
      } finally {
        running = false;
      }
    },
  };
}

export function createEstimateSerialMutationQueue(): {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
} {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue: <T>(operation: () => Promise<T>): Promise<T> => {
      const next = tail.then(operation);
      tail = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
  };
}

/** Opt-in draft saves only: destructive/create actions must never be replayed here. */
export function createEstimateDraftRetryRegistry() {
  const handlers = new Map<string, () => Promise<boolean>>();
  return {
    register: (key: string, retry: () => Promise<boolean>): (() => void) => {
      handlers.set(key, retry);
      return () => {
        if (handlers.get(key) === retry) handlers.delete(key);
      };
    },
    retry: async (failedKeys: readonly string[]): Promise<void> => {
      for (const key of [...failedKeys]) await handlers.get(key)?.();
    },
  };
}
