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
      docCounter: 0,
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

    // Delete all feature docs in workspace
    const docs = await ctx.db
      .query("featureDocs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
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
      if (ticket.archived === undefined) {
        patch.archived = false;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = Date.now();
        await ctx.db.patch(ticket._id, patch);
      }
    }
    if (ticketCounter !== (workspace.ticketCounter ?? 0)) {
      updates.ticketCounter = ticketCounter;
    }

    let docCounter = workspace.docCounter ?? 0;
    const docs = await ctx.db
      .query("featureDocs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    const sortedDocs = docs.slice().sort((a, b) => a.createdAt - b.createdAt);
    for (const doc of sortedDocs) {
      const patch: Record<string, unknown> = {};
      if (!doc.number) {
        docCounter += 1;
        patch.number = docCounter;
      }
      if (!doc.status) {
        patch.status = "unclaimed";
      }
      if (doc.order === undefined) {
        patch.order = doc.createdAt;
      }
      if (doc.archived === undefined) {
        patch.archived = false;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = Date.now();
        await ctx.db.patch(doc._id, patch);
      }
    }
    if (docCounter !== (workspace.docCounter ?? 0)) {
      updates.docCounter = docCounter;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }
  },
});
