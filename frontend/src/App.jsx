import { useState, useEffect } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AuthenticatedApp } from "./AuthenticatedApp.jsx";
import { SignInPage } from "./SignInPage.jsx";
import { LandingPage } from "./LandingPage.jsx";
import "./App.css";
import "./landing.css";

function App() {
  const [showSignIn, setShowSignIn] = useState(false);
  const [backendStatus, setBackendStatus] = useState(null);
  const [backendLoading, setBackendLoading] = useState(true);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const base = import.meta.env.VITE_API_URL;
        if (!base) {
          setBackendStatus("unset");
          return;
        }
        const response = await fetch(`${base}/health`);
        const data = await response.json();
        setBackendStatus(data.status);
      } catch (error) {
        setBackendStatus("error");
        console.error("Backend connection failed:", error);
      } finally {
        setBackendLoading(false);
      }
    };
    void checkBackend();
  }, []);

  return (
    <>
      <AuthLoading>
        <main className="app-main app-main--narrow">
          <p>Checking session…</p>
        </main>
      </AuthLoading>

      <Unauthenticated>
        {showSignIn ? (
          <main className="app-main app-main--auth">
            <button
              className="btn btn--ghost"
              style={{ position: "absolute", top: "1.25rem", left: "1.25rem" }}
              onClick={() => setShowSignIn(false)}
            >
              ← Back
            </button>
            <SignInPage />
          </main>
        ) : (
          <main className="app-main">
            <LandingPage
              onGetStarted={() => setShowSignIn(true)}
              backendLoading={backendLoading}
              backendStatus={backendStatus}
            />
          </main>
        )}
      </Unauthenticated>

      <Authenticated>
        <main className="app-main app-main--narrow">
          <AuthenticatedApp
            backendLoading={backendLoading}
            backendStatus={backendStatus}
          />
        </main>
      </Authenticated>
    </>
  );
}

export default App;
