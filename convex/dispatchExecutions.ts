import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireWorkspaceAccess } from "./access";

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    return await ctx.db
      .query("dispatchExecutions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(limit);
  },
});

export const listForTicket = query({
  args: {
    workspaceId: v.id("workspaces"),
    ticketId: v.id("tickets"),
    limit: v.optional(v.number()),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows = await ctx.db
      .query("dispatchExecutions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(500);
    return rows.filter((row) => row.ticketIds.includes(args.ticketId)).slice(0, limit);
  },
});

export const markCancelRequested = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    ticketIds: v.array(v.id("tickets")),
    dispatchId: v.optional(v.string()),
    runId: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ticketIds = [...new Set(args.ticketIds)] as Id<"tickets">[];
    const now = Date.now();
    const identity =
      (args.dispatchId && args.dispatchId.trim()) ||
      (args.runId && `run:${args.runId.trim()}`) ||
      null;
    if (!identity) {
      return { updated: false, reason: "missing_identity" as const };
    }

    const existing = await ctx.db
      .query("dispatchExecutions")
      .withIndex("by_workspace_dispatch", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("dispatchId", identity)
      )
      .first();

    const patch = {
      ticketIds,
      state: "cancel_requested",
      lastEventType: "kanbanthing.cancel_requested",
      updatedAt: now,
      cancelRequestedAt: now,
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.message ? { lastMessage: args.message } : {}),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { updated: true, dispatchExecutionId: existing._id, created: false };
    }

    const id = await ctx.db.insert("dispatchExecutions", {
      workspaceId: args.workspaceId,
      dispatchId: identity,
      ticketIds,
      state: "cancel_requested",
      lastEventType: "kanbanthing.cancel_requested",
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.message ? { lastMessage: args.message } : {}),
      createdAt: now,
      updatedAt: now,
      cancelRequestedAt: now,
    });
    return { updated: true, dispatchExecutionId: id, created: true };
  },
});
