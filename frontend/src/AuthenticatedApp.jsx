import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/clerk-react";
import { api } from "../convex/_generated/api";
import { SpeechSession } from "./SpeechSession.jsx";

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
  const profile = useQuery(api.users.me);

  const backendLabel = backendLoading
    ? "…"
    : backendStatus === "ok"
      ? "✓ Connected"
      : backendStatus === "unset"
        ? "— set VITE_API_URL"
        : "✗ Disconnected";

  const userId = profile?.clerkUserId ?? profile?.tokenIdentifier ?? "anonymous";

  return (
    <>
      <header className="app-header">
        <h1 style={{ margin: 0 }}>SpeechBridge</h1>
        <div className="app-header-right">
          <span className="app-api-badge" title="FastAPI /health">
            API {backendLabel}
          </span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <SpeechSession userId={userId} />
    </>
  );
}
