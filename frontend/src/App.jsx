import { useState } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AuthenticatedApp } from "./AuthenticatedApp.jsx";
import { SignInPage } from "./SignInPage.jsx";
import { LandingPage } from "./LandingPage.jsx";
import "./App.css";
import "./landing.css";

function App() {
  const [showSignIn, setShowSignIn] = useState(false);
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
              type="button"
              className="btn btn--ghost sign-in-back"
              onClick={() => setShowSignIn(false)}
            >
              ← Back
            </button>
            <SignInPage />
          </main>
        ) : (
          <main className="app-main">
            <LandingPage onGetStarted={() => setShowSignIn(true)} />
          </main>
        )}
      </Unauthenticated>

      <Authenticated>
        <main className="app-main">
          <AuthenticatedApp />
        </main>
      </Authenticated>
    </>
  );
}

export default App;
