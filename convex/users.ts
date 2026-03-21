import { mutation, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";


// ─────────────────────────────────────────────────────────────────────────────
// CLERK AUTH FUNCTIONS (existing — do not change)
// ─────────────────────────────────────────────────────────────────────────────

/** Raw JWT identity — good for debugging. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.auth.getUserIdentity();
  },
});

/** Current user document from the users table, or null if not stored yet. */
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
 * Call once after sign-in to upsert the user row.
 * Safe to call repeatedly — updates profile fields from the latest JWT claims.
 */
export const syncCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called syncCurrentUser while unauthenticated");
    }

    const now        = Date.now();
    const email      = typeof identity.email      === "string" ? identity.email      : undefined;
    const name       = typeof identity.name       === "string" ? identity.name       : undefined;
    const pictureUrl = typeof identity.pictureUrl === "string" ? identity.pictureUrl : undefined;
    const clerkUserId = typeof identity.subject   === "string" ? identity.subject    : undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        clerkUserId: clerkUserId ?? existing.clerkUserId,
        email:       email       ?? existing.email,
        name:        name        ?? existing.name,
        imageUrl:    pictureUrl  ?? existing.imageUrl,
        updatedAt:   now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId,
      email,
      name,
      imageUrl: pictureUrl,
      onboarding_completed: false,
      updatedAt: now,
    });
  },
});

/**
 * Called when the user finishes onboarding (condition chosen + practice phrases).
 * Persists condition for /process and profile features.
 */
export const completeOnboarding = mutation({
  args: {
    condition: v.union(
      v.literal("general"),
      v.literal("dysarthria"),
      v.literal("stuttering"),
      v.literal("aphasia"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!existing) {
      throw new Error("User row missing — try signing in again");
    }

    await ctx.db.patch(existing._id, {
      condition: args.condition,
      onboarding_completed: true,
      updatedAt: Date.now(),
    });

    return { status: "ok" as const };
  },
});


// ─────────────────────────────────────────────────────────────────────────────
// SPEECHBRIDGE PERSONALISATION FUNCTIONS (new)
// All lookups use clerkUserId — the same value main.py sends as user_id.
// ─────────────────────────────────────────────────────────────────────────────

/** 
 * Called by main.py at the start of each /process.
 * Returns the personalisation profile if it exists, null otherwise.
 */
export const getProfile = query({
  args: { user_id: v.string() },   // user_id = clerkUserId
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.user_id))
      .first();

    if (!user) return null;

    return {
      user_id:             user.clerkUserId ?? args.user_id,
      condition:           user.condition           ?? null,
      pattern_summary:     user.pattern_summary     ?? null,
      keyterms:            user.keyterms            ?? null,
      session_count:       user.session_count       ?? 0,
      good_session_count:  user.good_session_count  ?? 0,
      summarisation_count: user.summarisation_count ?? 0,
      voice_id:            user.voice_id            ?? null,
    };
  },
});


/**
 * Called by sessions:save after every /process.
 * Returns true if the summarisation job should fire.
 */
export const shouldSummarise = query({
  args: {
    user_id:    v.string(),   // clerkUserId
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.confidence < 0.75) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.user_id))
      .first();

    if (!user) return false;

    const goodCount          = user.good_session_count  ?? 0;
    const summarisationCount = user.summarisation_count ?? 0;

    const hitsCap        = summarisationCount >= 50;
    const isMultipleOf10 = goodCount > 0 && goodCount % 10 === 0;

    return isMultipleOf10 && !hitsCap;
  },
});


/**
 * Called by sessions:save to increment session counters on the user row.
 * Creates the personalisation fields with defaults on first call if missing.
 */
export const incrementCounters = internalMutation({
  args: {
    user_id:        v.string(),   // clerkUserId
    condition:      v.string(),
    is_good_session: v.boolean(), // confidence >= 0.75
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.user_id))
      .first();

    if (!user) {
      // User exists in Clerk but hasn't called syncCurrentUser yet — safe to skip
      return;
    }

    await ctx.db.patch(user._id, {
      condition:           args.condition,
      session_count:       (user.session_count       ?? 0) + 1,
      good_session_count:  (user.good_session_count  ?? 0) + (args.is_good_session ? 1 : 0),
      summarisation_count:  user.summarisation_count ?? 0,  // unchanged — summarise.py increments this
      updatedAt:            Date.now(),
    });
  },
});


/**
 * Called by summarise.py after Gemini produces a new profile.
 * Writes pattern_summary, keyterms, and bumps summarisation_count.
 */
export const updateProfile = mutation({
  args: {
    user_id:         v.string(),   // clerkUserId
    pattern_summary: v.string(),
    keyterms:        v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.user_id))
      .first();

    if (!user) throw new Error(`User ${args.user_id} not found`);

    const newCount = (user.summarisation_count ?? 0) + 1;

    await ctx.db.patch(user._id, {
      pattern_summary:     args.pattern_summary,
      keyterms:            args.keyterms,
      summarisation_count: newCount,
      updatedAt:           Date.now(),
    });

    return { version: newCount };
  },
});


/**
 * Called when user picks a voice in the UI.
 */
export const setVoice = mutation({
  args: {
    user_id:  v.string(),   // clerkUserId
    voice_id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.user_id))
      .first();

    if (!user) throw new Error(`User ${args.user_id} not found`);

    await ctx.db.patch(user._id, {
      voice_id:  args.voice_id,
      updatedAt: Date.now(),
    });

    return { status: "ok" };
  },
});