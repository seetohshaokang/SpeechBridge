import { useEffect, useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { SpeechSession } from "./SpeechSession.jsx";
import { SessionSidebar } from "./SessionSidebar.jsx";
import { OnboardingFlow } from "./OnboardingFlow.jsx";
import { BrandLogo } from "./BrandLogo.jsx";
import { clerkUserButtonAppearance } from "./clerkUserButtonTheme.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";

const SIDEBAR_COLLAPSED_KEY = "speechbridge-sidebar-collapsed";

function readSidebarCollapsed() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function useSyncUserProfile() {
  const sync = useMutation(api.users.syncCurrentUser);
  useEffect(() => {
    void sync();
  }, [sync]);
}

export function AuthenticatedApp() {
  useSyncUserProfile();
  const profile = useQuery(api.users.me);

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [viewingSession, setViewingSession] = useState(null);
  /** Bumps when user clicks “New session” so SpeechSession resets even if already on the record view. */
  const [sessionResetKey, setSessionResetKey] = useState(0);

  const sidebarOpen = isDesktop || mobileSidebarOpen;

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const userId = profile?.clerkUserId ?? profile?.tokenIdentifier ?? "anonymous";

  /** New accounts get `false` until onboarding; legacy rows omit field (undefined) → skip onboarding. */
  const needsOnboarding = profile?.onboarding_completed === false;
  const userCondition = profile?.condition ?? "general";

  const handleNewSession = useCallback(() => {
    setViewingSession(null);
    setSessionResetKey((k) => k + 1);
  }, []);

  const handleSelectSession = useCallback((session) => {
    setViewingSession(session);
  }, []);

  return (
    <div
      className={`auth-layout chat-shell${needsOnboarding ? " chat-shell--onboarding" : ""}`}
    >
      {!needsOnboarding && (
        <SessionSidebar
          userId={userId}
          docked={isDesktop}
          open={sidebarOpen}
          collapsed={isDesktop && sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          onClose={() => setMobileSidebarOpen(false)}
          selectedSessionId={viewingSession?.session_id ?? null}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      )}

      <div className="auth-workspace">
        <header className="chat-topbar">
          <div className="chat-topbar-left">
            {!isDesktop && (
              <button
                type="button"
                className="burger-btn"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open session history"
              >
                <span className="burger-line" />
                <span className="burger-line" />
                <span className="burger-line" />
              </button>
            )}
            <div className="chat-topbar-brand">
              <BrandLogo variant="nav" />
              <span className="chat-topbar-title">SpeechBridge</span>
            </div>
          </div>
          <div className="chat-topbar-right" />
        </header>

        <div className="user-btn-fixed">
          <UserButton
            afterSignOutUrl="/"
            appearance={clerkUserButtonAppearance}
          />
          {profile?.name && (
            <span className="user-btn-name">
              {profile.name.split(" ")[0]}
            </span>
          )}
        </div>

        <div className="auth-main">
          {profile === undefined ? (
            <p className="onb-loading">Loading profile…</p>
          ) : needsOnboarding ? (
            <OnboardingFlow userId={userId} />
          ) : (
            <SpeechSession
              userId={userId}
              userCondition={userCondition}
              viewingSession={viewingSession}
              sessionResetKey={sessionResetKey}
            />
          )}
        </div>
      </div>
    </div>
  );
}
