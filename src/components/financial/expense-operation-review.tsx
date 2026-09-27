"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  readExpenseOperation,
  transitionExpenseOperation,
  expenseOperationsChanged,
  type OperationDetail,
} from "@/lib/expense-operations-client";

export function ExpenseOperationReview({
  expenseId,
  disabled = false,
}: {
  expenseId: string;
  disabled?: boolean;
}) {
  const [detail, setDetail] = React.useState<OperationDetail | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("request_info");
  const [message, setMessage] = React.useState("");
  const [resolving, setResolving] = React.useState<string | null>(null);
  const currentId = React.useRef(expenseId);
  currentId.current = expenseId;
  const refresh = React.useCallback(async () => {
    try {
      const next = await readExpenseOperation(expenseId);
      if (currentId.current === expenseId) {
        setDetail(next);
        setError("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review unavailable.");
    }
  }, [expenseId]);
  React.useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setMessage("");
    setResolving(null);
    setError("");
    void readExpenseOperation(expenseId, controller.signal)
      .then(setDetail)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    const onChange = () => void refresh();
    window.addEventListener(expenseOperationsChanged, onChange);
    return () => {
      controller.abort();
      window.removeEventListener(expenseOperationsChanged, onChange);
    };
  }, [expenseId, refresh]);
  async function submit(nextAction: string) {
    if (!detail || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      await transitionExpenseOperation(
        expenseId,
        detail.state,
        nextAction,
        nextAction === "post"
          ? {}
          : { message: message.trim(), ...(resolving ? { issue_id: resolving } : {}) }
      );
      setMessage("");
      setResolving(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  const open = detail?.issues.filter((issue) => !issue.resolved_at) ?? [];
  return (
    <section
      className="space-y-3 border-t border-[var(--hh-border)] px-4 py-4"
      aria-label="Review and audit"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Review</h3>
        <span className="text-xs text-[var(--hh-text-secondary)]">
          {detail
            ? detail.state
              ? detail.state.posted_at
                ? "Posted"
                : detail.state.review_state === "approved"
                  ? "Approved · Not posted"
                  : "Pending"
              : "Unknown / Legacy"
            : "Loading…"}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--hh-danger)]">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void refresh()}>
            Retry
          </button>
        </p>
      )}
      {open.map((issue) => (
        <div key={issue.id} className="rounded-md border border-[var(--hh-border)] p-3 text-sm">
          <p className="font-medium">
            {issue.kind === "request_info"
              ? "Needs information"
              : issue.kind === "duplicate"
                ? "Duplicate quarantine"
                : "Exception"}
          </p>
          <p className="mt-1 break-words text-[var(--hh-text-secondary)]">{issue.message}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || disabled}
            onClick={() => {
              setResolving(issue.id);
              setMessage("");
            }}
          >
            Respond / resolve
          </Button>
        </div>
      ))}
      {detail && !detail.state?.posted_at && (
        <details data-expense-operation-compose open={resolving !== null}>
          <summary className="cursor-pointer py-2 text-sm">Request Info or flag an issue</summary>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(resolving ? "resolve" : action);
            }}
          >
            <label className="block text-xs font-medium" htmlFor={`review-action-${expenseId}`}>
              {resolving ? "Resolution and evidence" : "Add a review issue"}
            </label>
            {!resolving && (
              <select
                id={`review-action-${expenseId}`}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                disabled={busy || disabled}
                className="min-h-11 w-full rounded-md border border-[var(--hh-border)] bg-transparent px-2 text-sm"
              >
                <option value="request_info">Request Info</option>
                <option value="exception">Exception</option>
                <option value="duplicate">Duplicate quarantine</option>
              </select>
            )}
            <Textarea
              aria-label={resolving ? "Resolution evidence" : "Review message"}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              required
              disabled={busy || disabled}
              placeholder={
                resolving
                  ? "Record the response and reason for resolution"
                  : "What needs to be confirmed?"
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={busy || disabled || !message.trim()}
              >
                {busy
                  ? "Saving…"
                  : resolving
                    ? "Resolve with evidence"
                    : action === "request_info"
                      ? "Request Info"
                      : "Add issue"}
              </Button>
              {resolving && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setResolving(null)}>
                  Cancel
                </Button>
              )}
            </div>
            <p className="text-xs text-[var(--hh-text-secondary)]">
              Saved to this transaction. No message is sent automatically.
            </p>
          </form>
        </details>
      )}
      {detail?.state?.review_state === "approved" && !detail.state.posted_at && (
        <Button
          type="button"
          variant="outline"
          disabled={busy || disabled || open.length > 0}
          onClick={() => void submit("post")}
        >
          Post
        </Button>
      )}
      {detail && (
        <details className="text-xs text-[var(--hh-text-secondary)]">
          <summary className="min-h-9 cursor-pointer py-2">Sources and audit history</summary>
          <ul className="space-y-2">
            {detail.sources.map((source) => (
              <li key={`${source.source_kind}:${source.source_key}`}>
                {source.source_kind.replaceAll("_", " ")} · {source.source_key}
              </li>
            ))}
          </ul>
          <ol className="mt-3 space-y-2">
            {detail.events.map((event) => (
              <li key={event.id}>
                {event.action.replaceAll("_", " ")} · {new Date(event.created_at).toLocaleString()}
              </li>
            ))}
          </ol>
          {!detail.events.length && (
            <p>No recorded operations. Historical state remains Unknown / Legacy.</p>
          )}
          {detail.events.length === 100 && <p>Showing latest 100 events.</p>}
        </details>
      )}
    </section>
  );
}
