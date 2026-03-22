import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Lookup Telegram user row by numeric Telegram user id (string). */
export const getByTgUserId = query({
  args: { tg_user_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("telegram_users")
      .withIndex("by_tg_user_id", (q) => q.eq("tg_user_id", args.tg_user_id))
      .unique();
  },
});

/** Create or update voice clone id for a Telegram user. */
export const setVoiceId = mutation({
  args: {
    tg_user_id: v.string(),
    voice_id: v.string(),
    tg_username: v.optional(v.string()),
    condition: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("telegram_users")
      .withIndex("by_tg_user_id", (q) => q.eq("tg_user_id", args.tg_user_id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        voice_id: args.voice_id,
        tg_username: args.tg_username ?? existing.tg_username,
        condition: args.condition ?? existing.condition,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("telegram_users", {
      tg_user_id: args.tg_user_id,
      voice_id: args.voice_id,
      tg_username: args.tg_username,
      condition: args.condition,
      updatedAt: now,
    });
  },
});
