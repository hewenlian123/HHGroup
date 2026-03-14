/**
 * Next.js instrumentation: runs once when the Node server starts.
 * Captures console.log/warn/error into the system log store for /system-logs.
 */
import { captureConsole } from "@/lib/system-log-store";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    captureConsole();
  }
}
