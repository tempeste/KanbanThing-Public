import { query } from "./_generated/server";
import { v } from "convex/values";

export const listByTicket = query({
  args: {
    ticketId: v.id("tickets"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("ticketActivities")
      .withIndex("by_ticket_createdAt", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .take(limit);
  },
});
