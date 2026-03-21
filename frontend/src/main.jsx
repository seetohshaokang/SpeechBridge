import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import "./index.css";
import App from "./App.jsx";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

console.log("All env vars:", import.meta.env);

if (!convexUrl) {
  throw new Error("Missing CONVEX_URL (run `npm run convex:dev` at repo root once).");
}
if (!clerkPublishableKey) {
  throw new Error(
    "Missing CLERK_PUBLISHABLE_KEY. Add it to .env.local (Clerk → API keys).",
  );
}

const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
);
