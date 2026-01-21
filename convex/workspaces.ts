import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    return await ctx.db.insert("workspaces", {
      name: args.name,
      docs: args.docs,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("workspaces"),
    name: v.optional(v.string()),
    docs: v.optional(v.string()),
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
