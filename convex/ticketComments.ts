import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { actorValidator, logTicketActivity, resolveActor } from "./activityHelpers";

export const listByTicket = query({
  args: {
    ticketId: v.id("tickets"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("ticketComments")
      .withIndex("by_ticket_createdAt", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .take(limit);
  },
});

export const add = mutation({
  args: {
    ticketId: v.id("tickets"),
    body: v.string(),
    actor: v.optional(actorValidator),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    if (!args.body.trim()) {
      throw new Error("Comment body is required");
    }

    const resolved = await resolveActor(ctx, args.actor);
    const commentId = await ctx.db.insert("ticketComments", {
      workspaceId: ticket.workspaceId,
      ticketId: args.ticketId,
      body: args.body.trim(),
      authorType: resolved.actorType,
      authorId: resolved.actorId,
      authorDisplayName: resolved.actorDisplayName,
      createdAt: Date.now(),
    });

    await logTicketActivity(ctx, {
      workspaceId: ticket.workspaceId,
      ticketId: args.ticketId,
      type: "ticket_comment_added",
      data: { commentId },
      actor: args.actor,
    });

    return commentId;
  },
});
