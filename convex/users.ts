import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Raw JWT identity (good for debugging). Prefer `me` for app data. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.auth.getUserIdentity();
  },
});

/** Current user document from your `users` table, or null if not stored yet. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
  },
});

/**
 * Call once after sign-in (e.g. from the authenticated shell) to upsert the user row.
 * Safe to call repeatedly — updates profile fields from the latest JWT claims.
 */
export const syncCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called syncCurrentUser while unauthenticated");
    }

    const now = Date.now();
    const email =
      typeof identity.email === "string" ? identity.email : undefined;
    const name =
      typeof identity.name === "string" ? identity.name : undefined;
    const pictureUrl =
      typeof identity.pictureUrl === "string"
        ? identity.pictureUrl
        : undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    const clerkUserId =
      typeof identity.subject === "string" ? identity.subject : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        clerkUserId: clerkUserId ?? existing.clerkUserId,
        email: email ?? existing.email,
        name: name ?? existing.name,
        imageUrl: pictureUrl ?? existing.imageUrl,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId,
      email,
      name,
      imageUrl: pictureUrl,
      updatedAt: now,
    });
  },
});
