import { useState } from "react";
import type { DuplicateSummary } from "../lib/dedupe.js";

interface Props {
  summary: DuplicateSummary;
  busy: boolean;
  onConfirm: () => void | Promise<void>;
}

const btnClass =
  "px-3 py-1 rounded bg-fog text-cyan-soft text-sm hover:bg-cyan hover:text-ink disabled:opacity-40";
const dangerClass =
  "px-3 py-1 rounded border border-magenta text-magenta text-sm hover:bg-magenta hover:text-ink disabled:opacity-40";

/** Shown on the list page when several active entries share a URL. */
export function DuplicatesNotice({ summary, busy, onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false);
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div
      data-testid="duplicates-notice"
      role="status"
      className="mb-3 border border-magenta rounded px-4 py-3 bg-mist flex flex-wrap items-center gap-3 text-sm"
    >
      <span className="text-cyan-soft">
        <span className="text-magenta font-semibold">{fmt(summary.extra)} duplicate entries</span>
        {" "}across {fmt(summary.urls)} {summary.urls === 1 ? "URL" : "URLs"}.
      </span>
      {!confirming ? (
        <button type="button" className={btnClass} disabled={busy} onClick={() => setConfirming(true)}>
          Remove duplicates
        </button>
      ) : (
        <>
          <span className="text-cyan-soft">
            Keep one per URL (tags and notes merged) and move {fmt(summary.extra)} to trash?
          </span>
          <button
            type="button"
            className={dangerClass}
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              void onConfirm();
            }}
          >
            Move {fmt(summary.extra)} to trash
          </button>
          <button type="button" className={btnClass} disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
