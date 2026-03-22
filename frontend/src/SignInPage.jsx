import { useEffect, useState } from "react";
import { SignIn } from "@clerk/clerk-react";
import { BrandLogo } from "./BrandLogo.jsx";
import {
  clerkSignInVariablesDark,
  clerkSignInVariablesLight,
} from "./clerkSignInTheme.js";

function usePrefersDarkColorScheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return dark;
}

/**
 * Clerk-hosted UI — customize via `appearance` and Clerk Dashboard
 * (Branding → logo, colors). Docs: https://clerk.com/docs/customization/overview
 *
 * We hide Clerk’s default “Sign in to My Application” header; app name lives in
 * `.sign-in-brand` above the card. Rename the app in Clerk Dashboard if you
 * prefer to show Clerk’s header instead.
 */
export function SignInPage() {
  const prefersDark = usePrefersDarkColorScheme();
  const variables = prefersDark
    ? clerkSignInVariablesDark
    : clerkSignInVariablesLight;

  return (
    <div className="sign-in-page">
      <div className="sign-in-split">
        <div className="sign-in-split__brand">
          <header className="sign-in-brand">
            <div className="sign-in-logo-wrap">
              <BrandLogo variant="signin" />
            </div>
            <p className="sign-in-eyebrow">Welcome</p>
            <h1 className="sign-in-title-main">SpeechBridge</h1>
            <p className="sign-in-tagline">
              Sign in to save sessions and sync across devices.
            </p>
          </header>
        </div>

        <div className="sign-in-split__form">
          <div className="sign-in-card-wrap">
            <SignIn
              routing="hash"
              appearance={{
                variables: {
                  ...variables,
                  fontSize: "1rem",
                },
              elements: {
                rootBox: "sign-in-root",
                card: "sign-in-card",
                header: "sign-in-clerk-header--hidden",
                headerTitle: "sign-in-clerk-header--hidden",
                headerSubtitle: "sign-in-clerk-header--hidden",
                socialButtonsRoot: "sign-in-social-root",
                socialButtonsBlockButton:
                  "sign-in-social-btn transition-transform hover:scale-[1.01] active:scale-[0.99]",
                socialButtonsBlockButtonText: "sign-in-social-label",
                socialButtonsProviderIcon: "sign-in-social-icon",
                socialButtonsBlockButtonArrow: { display: "none" },
                badge: { display: "none" },
              },
              layout: {
                socialButtonsPlacement: "top",
              },
            }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
