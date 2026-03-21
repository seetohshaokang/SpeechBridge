import { SignIn } from "@clerk/clerk-react";
import { BrandLogo } from "./BrandLogo.jsx";

/**
 * Clerk-hosted UI — customize via `appearance` and Clerk Dashboard
 * (Branding → logo, colors). Docs: https://clerk.com/docs/customization/overview
 *
 * We hide Clerk’s default “Sign in to My Application” header; app name lives in
 * `.sign-in-brand` above the card. Rename the app in Clerk Dashboard if you
 * prefer to show Clerk’s header instead.
 */
export function SignInPage() {
  return (
    <div className="sign-in-page">
      <div className="sign-in-shell">
        <header className="sign-in-brand">
          <div className="sign-in-logo-wrap">
            <BrandLogo variant="hero" />
          </div>
          <p className="sign-in-eyebrow">Welcome</p>
          <h1 className="sign-in-title-main">SpeechBridge</h1>
          <p className="sign-in-tagline">
            Sign in to save sessions and sync across devices.
          </p>
        </header>

        <div className="sign-in-card-wrap">
          <SignIn
            routing="hash"
            appearance={{
              variables: {
                colorPrimary: "#2563eb",
                colorText: "#18181b",
                colorTextSecondary: "#71717a",
                borderRadius: "0.75rem",
                fontFamily: "system-ui, sans-serif",
              },
              elements: {
                rootBox: "sign-in-root",
                card: "sign-in-card",
                header: "sign-in-clerk-header--hidden",
                headerTitle: "sign-in-clerk-header--hidden",
                headerSubtitle: "sign-in-clerk-header--hidden",
                socialButtonsBlockButton:
                  "transition-transform hover:scale-[1.01] active:scale-[0.99]",
              },
              layout: {
                socialButtonsPlacement: "top",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
