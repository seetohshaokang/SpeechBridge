import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/clerk-react";
import { api } from "../convex/_generated/api";

/** Upserts the Convex `users` row from the current Clerk session. */
function useSyncUserProfile() {
  const sync = useMutation(api.users.syncCurrentUser);
  useEffect(() => {
    void sync();
  }, [sync]);
}

export function AuthenticatedApp({
  backendLoading = true,
  backendStatus = null,
}) {
  useSyncUserProfile();
  const identity = useQuery(api.users.viewer);
  const profile = useQuery(api.users.me);

  const backendLabel =
    backendLoading
      ? "…"
      : backendStatus === "ok"
        ? "✓ Connected"
        : backendStatus === "unset"
          ? "— set VITE_API_URL"
          : "✗ Disconnected";

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>SpeechBridge</h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "0.875rem",
              color: "#71717a",
            }}
            title="FastAPI /health"
          >
            API {backendLabel}
          </span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <section>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
          Stored profile (Convex <code>users</code> table)
        </h2>
        <p style={{ fontSize: "0.875rem", color: "#666", marginTop: 0 }}>
          This row is created/updated by <code>syncCurrentUser</code> after
          login. Add more fields in <code>convex/schema.ts</code> as you need.
        </p>
        <pre
          style={{
            background: "#f4f4f5",
            padding: "1rem",
            borderRadius: 8,
            overflow: "auto",
            fontSize: 12,
          }}
        >
          {profile === undefined
            ? "Loading…"
            : JSON.stringify(profile, null, 2)}
        </pre>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
          Raw identity (JWT)
        </h2>
        <pre
          style={{
            background: "#fafafa",
            padding: "1rem",
            borderRadius: 8,
            overflow: "auto",
            fontSize: 12,
          }}
        >
          {identity === undefined
            ? "Loading…"
            : JSON.stringify(identity, null, 2)}
        </pre>
      </section>
    </>
  );
}
