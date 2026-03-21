import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";


// ── sessions:save ─────────────────────────────────────────────────────────
// Called by main.py after every /process.
// Inserts the session row and increments user counters.

export const save = mutation({
  args: {
    session_id:     v.string(),
    user_id:        v.string(),   // clerkUserId
    condition:      v.string(),
    raw_transcript: v.string(),
    corrected_text: v.string(),
    confidence:     v.number(),
    changes:        v.array(v.string()),
    processing_ms:  v.number(),
  },
  handler: async (ctx, args) => {
    const now            = Date.now();
    const isGoodSession  = args.confidence >= 0.75;

    await ctx.db.insert("sessions", {
      session_id:     args.session_id,
      user_id:        args.user_id,
      condition:      args.condition,
      raw_transcript: args.raw_transcript,
      corrected_text: args.corrected_text,
      confidence:     args.confidence,
      changes:        args.changes,
      processing_ms:  args.processing_ms,
      created_at:     now,
    });

    // Increment counters on the user row — user row is owned by Clerk auth,
    // so we patch rather than upsert.
    await ctx.runMutation(internal.users.incrementCounters, {
      user_id:         args.user_id,
      condition:       args.condition,
      is_good_session: isGoodSession,
    });

    return { session_id: args.session_id };
  },
});


// ── sessions:getForSummarisation ──────────────────────────────────────────
// Called by summarise.py to fetch the last N high-confidence sessions.

export const getForSummarisation = query({
  args: {
    user_id:        v.string(),
    limit:          v.optional(v.number()),
    min_confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit   = args.limit          ?? 10;
    const minConf = args.min_confidence ?? 0.75;

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .order("desc")
      .filter((q) => q.gte(q.field("confidence"), minConf))
      .take(limit);

    return sessions.map((s) => ({
      session_id:     s.session_id,
      condition:      s.condition,
      raw_transcript: s.raw_transcript,
      corrected_text: s.corrected_text,
      confidence:     s.confidence,
      created_at:     s.created_at,
    }));
  },
});


// ── sessions:get ──────────────────────────────────────────────────────────
// Fetch a single session by session_id.

export const get = query({
  args: { session_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_session_id", (q) => q.eq("session_id", args.session_id))
      .first();
  },
});


// ── sessions:listByUser ───────────────────────────────────────────────────
// Returns the last N sessions for a user — for the history UI.

export const listByUser = query({
  args: {
    user_id: v.string(),
    limit:   v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .order("desc")
      .take(limit);
  },
});