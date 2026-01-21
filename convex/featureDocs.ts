import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("featureDocs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("featureDocs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("featureDocs", {
      workspaceId: args.workspaceId,
      title: args.title,
      content: args.content,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("featureDocs"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const doc = await ctx.db.get(id);
    if (!doc) {
      throw new Error("Feature doc not found");
    }
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("featureDocs") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Feature doc not found");
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_workspace_doc", (q) =>
        q.eq("workspaceId", doc.workspaceId).eq("docId", args.id)
      )
      .collect();

    for (const ticket of tickets) {
      await ctx.db.patch(ticket._id, {
        docId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(args.id);
  },
});
