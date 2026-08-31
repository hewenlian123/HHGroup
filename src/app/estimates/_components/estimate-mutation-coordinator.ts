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
