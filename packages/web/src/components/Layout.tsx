import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export type LayoutStatus =
  | { kind: "ok"; message: string }
  | { kind: "warn"; message: string }
  | { kind: "err"; message: string }
  | { kind: "loading"; message: string };

interface Props {
  children: ReactNode;
  status: LayoutStatus;
  onRefresh: () => void;
  onExport?: () => void;
  refreshing: boolean;
}

const navLinkBase = "px-3 py-1 rounded";
const navLinkActive = "bg-fog text-cyan";
const navLinkInactive = "text-cyan-soft hover:text-cyan";

export function Layout({ children, status, onRefresh, onExport, refreshing }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-fog px-4 py-3 flex items-center gap-4">
        <span className="text-magenta font-bold text-lg">gitmarks</span>
        <nav className="flex gap-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`
            }
          >
            List
          </NavLink>
          <NavLink
            to="/tags"
            className={({ isActive }) =>
              `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`
            }
          >
            Tags
          </NavLink>
          <NavLink
            to="/trash"
            className={({ isActive }) =>
              `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`
            }
          >
            Trash
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <StatusPill status={status} />
          {onExport !== undefined && (
            <button
              type="button"
              onClick={onExport}
              className="px-3 py-1 rounded border border-fog text-cyan-soft hover:border-cyan"
            >
              Export
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="px-3 py-1 rounded border border-fog text-cyan-soft hover:border-cyan disabled:opacity-40"
          >
            {refreshing ? "Syncing…" : "Sync from GitHub"}
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function StatusPill({ status }: { status: LayoutStatus }) {
  const color =
    status.kind === "ok"
      ? "text-cyan"
      : status.kind === "warn"
        ? "text-yellow-300"
        : status.kind === "err"
          ? "text-magenta"
          : "text-cyan-soft";
  return <span className={color}>{status.message}</span>;
}
