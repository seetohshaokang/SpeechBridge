import type { AuthConfig } from "convex/server";

/**
 * Clerk JWT validation for Convex.
 * Set CLERK_JWT_ISSUER_DOMAIN in Convex (same value as Clerk "Frontend API URL"):
 *   npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://YOUR_INSTANCE.clerk.accounts.dev"
 *
 * Enable Clerk → Convex integration: https://dashboard.clerk.com/apps/setup/convex
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
