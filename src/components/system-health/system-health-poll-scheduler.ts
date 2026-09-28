const INITIAL_SYSTEM_HEALTH_POLL_DELAY_MS = 1_200;

export function scheduleInitialSystemHealthPoll(run: () => void | Promise<void>): () => void {
  const timeout = setTimeout(() => {
    void run();
  }, INITIAL_SYSTEM_HEALTH_POLL_DELAY_MS);

  return () => clearTimeout(timeout);
}
