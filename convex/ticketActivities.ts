import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireWorkspaceAccess } from "./access";

export const listByTicket = query({
  args: {
    ticketId: v.id("tickets"),
    limit: v.optional(v.number()),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return [];
    await requireWorkspaceAccess(ctx, ticket.workspaceId, args.agentApiKeyId);
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("ticketActivities")
      .withIndex("by_ticket_createdAt", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .take(limit);
  },
});
