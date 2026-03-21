import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ── profile_versions:save ─────────────────────────────────────────────────
// Called by the summarisation job before overwriting the user's current
// profile in the users table. Archives the new version for rollback.

export const save = mutation({
  args: {
    user_id:         v.string(),
    version:         v.number(),
    pattern_summary: v.string(),
    keyterms:        v.array(v.string()),
    sessions_used:   v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("profile_versions", {
      user_id:         args.user_id,
      version:         args.version,
      pattern_summary: args.pattern_summary,
      keyterms:        args.keyterms,
      sessions_used:   args.sessions_used,
      created_at:      Date.now(),
    });

    return { version: args.version };
  },
});


// ── profile_versions:listByUser ───────────────────────────────────────────
// Returns all profile versions for a user, newest first.
// Useful for a debug/admin view showing how the profile evolved.

export const listByUser = query({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("profile_versions")
      .withIndex("by_user_latest", (q) => q.eq("user_id", args.user_id))
      .order("desc")
      .collect();
  },
});


// ── profile_versions:getVersion ───────────────────────────────────────────
// Fetch a specific version for a user — used for rollback.

export const getVersion = query({
  args: {
    user_id: v.string(),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("profile_versions")
      .withIndex("by_user_id", (q) =>
        q.eq("user_id", args.user_id).eq("version", args.version)
      )
      .first();
  },
});


// ── profile_versions:rollback ─────────────────────────────────────────────
// Restores a specific archived version as the user's current profile.
// Patches the users table directly — does not create a new version row.

export const rollback = mutation({
  args: {
    user_id: v.string(),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    // Find the archived version
    const archived = await ctx.db
      .query("profile_versions")
      .withIndex("by_user_id", (q) =>
        q.eq("user_id", args.user_id).eq("version", args.version)
      )
      .first();

    if (!archived) {
      throw new Error(`Version ${args.version} not found for user ${args.user_id}`);
    }

    // Find and patch the live user row
    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.user_id))
        .first();

    if (!user) throw new Error(`User ${args.user_id} not found`);

    await ctx.db.patch(user._id, {
      pattern_summary: archived.pattern_summary,
      keyterms:        archived.keyterms,
      updatedAt: Date.now(),  
    });

    return {
      status:  "rolled back",
      user_id: args.user_id,
      version: args.version,
    };
  },
});