import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 172_800_000) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(str, len = 52) {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

export function SessionSidebar({
  userId,
  /** When true, sidebar is in-document (desktop); when false, overlay drawer (mobile). */
  docked,
  open,
  /** Desktop only: narrow icon strip */
  collapsed,
  onToggleCollapsed = () => {},
  onClose,
  selectedSessionId,
  onSelectSession,
  onNewSession,
}) {
  const sessions = useQuery(
    api.sessions.listByUser,
    userId && userId !== "anonymous" ? { user_id: userId, limit: 50 } : "skip",
  );

  const showBackdrop = !docked && open;
  const showClose = !docked;

  const handleNew = () => {
    onNewSession();
    if (!docked) onClose();
  };

  const handlePick = (s) => {
    onSelectSession(s);
    if (!docked) onClose();
  };

  const asideClass = [
    "sidebar",
    open ? "sidebar--open" : "",
    docked ? "sidebar--docked" : "",
    docked && collapsed ? "sidebar--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {showBackdrop && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside className={asideClass} aria-label="Session history">
        <div
          className={`sidebar-top${docked ? " sidebar-top--docked" : ""}`}
        >
          {docked && !collapsed && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggleCollapsed}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <span className="sidebar-collapse-icon" aria-hidden>
                ‹
              </span>
            </button>
          )}
          {docked && collapsed && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <span className="sidebar-collapse-icon" aria-hidden>
                ›
              </span>
            </button>
          )}
          {showClose && (
            <button
              type="button"
              className="sidebar-close"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              ✕
            </button>
          )}
        </div>

        <button type="button" className="sidebar-new-chat" onClick={handleNew}>
          <span className="sidebar-new-chat-icon" aria-hidden>
            +
          </span>
          <span className="sidebar-new-chat-label">New session</span>
        </button>

        <p className="sidebar-section-label">Your sessions</p>

        <nav className="sidebar-list" aria-label="Past sessions">
          {!sessions && <p className="sidebar-empty">Loading…</p>}

          {sessions?.length === 0 && (
            <p className="sidebar-empty">
              No sessions yet — start by recording below.
            </p>
          )}

          {sessions?.map((s) => (
            <button
              key={s._id}
              type="button"
              className={`sidebar-item${
                selectedSessionId === s.session_id ? " sidebar-item--active" : ""
              }`}
              onClick={() => handlePick(s)}
            >
              <span className="sidebar-item-text">
                {truncate(s.corrected_text || s.raw_transcript)}
              </span>
              <span className="sidebar-item-meta">
                <span className="sidebar-item-condition">{s.condition}</span>
                <span className="sidebar-item-date">{formatDate(s.created_at)}</span>
              </span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
