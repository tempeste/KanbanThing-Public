import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { generateWorkspacePrefix } from "./prefix";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("workspaces").collect();
  },
});

export const get = query({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    docs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prefix = generateWorkspacePrefix(args.name);
    return await ctx.db.insert("workspaces", {
      name: args.name,
      docs: args.docs,
      prefix,
      ticketCounter: 0,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("workspaces"),
    name: v.optional(v.string()),
    docs: v.optional(v.string()),
    prefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const workspace = await ctx.db.get(id);
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Delete all tickets in workspace
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    for (const ticket of tickets) {
      await ctx.db.delete(ticket._id);
    }

    // Delete all API keys in workspace
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    for (const apiKey of apiKeys) {
      await ctx.db.delete(apiKey._id);
    }

    // Delete workspace
    await ctx.db.delete(args.id);
  },
});

export const backfillIdentifiers = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.id);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const updates: Record<string, unknown> = {};
    let prefix = workspace.prefix;
    if (!prefix) {
      prefix = generateWorkspacePrefix(workspace.name);
      updates.prefix = prefix;
    }

    let ticketCounter = workspace.ticketCounter ?? 0;
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    const childCounts = new Map<string, { count: number; done: number }>();
    for (const ticket of tickets) {
      if (!ticket.parentId) continue;
      if (ticket.archived) continue;
      const entry = childCounts.get(ticket.parentId) ?? { count: 0, done: 0 };
      entry.count += 1;
      if (ticket.status === "done") entry.done += 1;
      childCounts.set(ticket.parentId, entry);
    }
    const sortedTickets = tickets.slice().sort((a, b) => a.createdAt - b.createdAt);
    for (const ticket of sortedTickets) {
      const patch: Record<string, unknown> = {};
      if (!ticket.number) {
        ticketCounter += 1;
        patch.number = ticketCounter;
      }
      if (ticket.order === undefined) {
        patch.order = ticket.createdAt;
      }
      if (ticket.parentId === undefined) {
        patch.parentId = null;
      }
      if (ticket.archived === undefined) {
        patch.archived = false;
      }
      const counts = childCounts.get(ticket._id) ?? { count: 0, done: 0 };
      if (ticket.childCount === undefined || ticket.childCount !== counts.count) {
        patch.childCount = counts.count;
      }
      if (ticket.childDoneCount === undefined || ticket.childDoneCount !== counts.done) {
        patch.childDoneCount = counts.done;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = Date.now();
        await ctx.db.patch(ticket._id, patch);
      }
    }
    if (ticketCounter !== (workspace.ticketCounter ?? 0)) {
      updates.ticketCounter = ticketCounter;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }
  },
});

export const resetWorkspaceTickets = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.id);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();

    for (const ticket of tickets) {
      await ctx.db.delete(ticket._id);
    }

    await ctx.db.patch(args.id, {
      ticketCounter: 0,
    });
  },
});

export const resetAllTickets = mutation({
  args: {},
  handler: async (ctx) => {
    const workspaces = await ctx.db.query("workspaces").collect();
    for (const workspace of workspaces) {
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .collect();

      for (const ticket of tickets) {
        await ctx.db.delete(ticket._id);
      }

      await ctx.db.patch(workspace._id, {
        ticketCounter: 0,
      });
    }
  },
});
