import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("apiKeys")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const getByHash = query({
  args: { keyHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .first();
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    keyHash: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("apiKeys", {
      workspaceId: args.workspaceId,
      keyHash: args.keyHash,
      name: args.name,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
