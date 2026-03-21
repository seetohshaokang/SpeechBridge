import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // ── users ─────────────────────────────────────────────────────────────────
  // Auth fields come from Clerk via syncCurrentUser.
  // Personalisation fields are written by the Python summarisation job.
  users: defineTable({
    // ── Clerk auth fields (existing — do not change) ──────────────────────
    tokenIdentifier: v.string(),
    clerkUserId:     v.optional(v.string()),
    email:           v.optional(v.string()),
    name:            v.optional(v.string()),
    imageUrl:        v.optional(v.string()),
    updatedAt:       v.number(),

    // ── SpeechBridge personalisation fields (new) ─────────────────────────
    /** Set false for new accounts until onboarding finishes; undefined = legacy (treated as done). */
    onboarding_completed: v.optional(v.boolean()),
    condition:            v.optional(v.string()),
    pattern_summary:      v.optional(v.string()),   // injected into Gemini prompt
    keyterms:             v.optional(v.array(v.string())), // replaces default Scribe keyterms
    session_count:        v.optional(v.number()),
    good_session_count:   v.optional(v.number()),
    summarisation_count:  v.optional(v.number()),
    voice_id:             v.optional(v.string()),
  })
    .index("by_token",   ["tokenIdentifier"])    // existing — Clerk auth lookup
    .index("by_clerk_id", ["clerkUserId"]),       // new — Python backend lookup by clerkUserId


  // ── sessions ──────────────────────────────────────────────────────────────
  // One row per /process call. Written by main.py after every agent run.
  sessions: defineTable({
    session_id:     v.string(),
    user_id:        v.string(),   // clerkUserId
    condition:      v.string(),
    raw_transcript: v.string(),
    corrected_text: v.string(),
    confidence:     v.number(),
    changes:        v.array(v.string()),
    processing_ms:  v.number(),
    created_at:     v.number(),
  })
    .index("by_user",            ["user_id", "created_at"])
    .index("by_session_id",      ["session_id"])
    .index("by_user_confidence", ["user_id", "confidence"]),


  // ── profile_versions ──────────────────────────────────────────────────────
  // One archived row per summarisation run — for rollback.
  profile_versions: defineTable({
    user_id:         v.string(),   // clerkUserId
    version:         v.number(),
    pattern_summary: v.string(),
    keyterms:        v.array(v.string()),
    sessions_used:   v.number(),
    created_at:      v.number(),
  })
    .index("by_user_id",     ["user_id", "version"])
    .index("by_user_latest", ["user_id", "created_at"]),

});