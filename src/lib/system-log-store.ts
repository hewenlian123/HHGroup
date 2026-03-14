/**
 * In-memory store for system log entries (server-side).
 * Used by instrumentation to capture console output and by GET /api/system-logs.
 */

export type SystemLogType = "Info" | "Warning" | "Error";

export type SystemLogEntry = {
  time: string;
  module: string;
  type: SystemLogType;
  message: string;
};

const MAX_ENTRIES = 500;
const entries: SystemLogEntry[] = [];

function formatTime(now: Date): string {
  return now.toTimeString().slice(0, 8);
}

/** Parse "[module] message" or "message" from first console arg. */
function parseArgs(args: unknown[]): { module: string; message: string } {
  const first = args[0];
  if (typeof first === "string") {
    const match = first.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
    if (match) {
      return { module: match[1].trim(), message: (match[2] || "").trim() || first };
    }
    return { module: "Server", message: first };
  }
  if (args.length === 0) return { module: "Server", message: "" };
  try {
    return { module: "Server", message: JSON.stringify(first) };
  } catch {
    return { module: "Server", message: String(first) };
  }
}

function append(type: SystemLogType, args: unknown[]) {
  const { module, message } = parseArgs(args);
  const rest = args.length > 1 ? args.slice(1) : [];
  let fullMessage = message;
  if (rest.length > 0) {
    try {
      fullMessage = [message, ...rest.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))].join(" ");
    } catch {
      fullMessage = message + " " + String(rest[0]);
    }
  }
  const entry: SystemLogEntry = {
    time: formatTime(new Date()),
    module,
    type,
    message: fullMessage.slice(0, 2000),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function addSystemLog(entry: Omit<SystemLogEntry, "time">) {
  const full: SystemLogEntry = {
    ...entry,
    time: formatTime(new Date()),
  };
  entries.push(full);
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function getSystemLogs(limit = 200): SystemLogEntry[] {
  return [...entries].reverse().slice(0, limit);
}

export function captureConsole() {
  if (typeof console === "undefined") return;
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = function (...args: unknown[]) {
    append("Info", args);
    return origLog.apply(console, args);
  };
  console.warn = function (...args: unknown[]) {
    append("Warning", args);
    return origWarn.apply(console, args);
  };
  console.error = function (...args: unknown[]) {
    append("Error", args);
    return origError.apply(console, args);
  };
}
