import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * App user row — synced from Clerk via ctx.auth.getUserIdentity().
 * See: https://docs.convex.dev/auth/database-auth
 */
export default defineSchema({
  users: defineTable({
    /** Stable id from the auth provider (Clerk subject / JWT) */
    tokenIdentifier: v.string(),
    clerkUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    /** When this row was last updated from the IdP */
    updatedAt: v.number(),
  }).index("by_token", ["tokenIdentifier"]),
});
