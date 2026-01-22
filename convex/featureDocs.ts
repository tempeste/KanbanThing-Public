import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { generateWorkspacePrefix } from "./prefix";

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
    parentDocId: v.optional(v.union(v.id("featureDocs"), v.null())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    let parentDocId: typeof args.parentDocId | undefined = args.parentDocId;
    if (parentDocId === null) {
      parentDocId = undefined;
    }
    if (parentDocId) {
      const parent = await ctx.db.get(parentDocId);
      if (!parent || parent.workspaceId !== args.workspaceId) {
        throw new Error("Invalid parent doc");
      }
    }
    const nextNumber = (workspace.docCounter ?? 0) + 1;
    const prefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);
    await ctx.db.patch(args.workspaceId, {
      prefix,
      docCounter: nextNumber,
    });
    return await ctx.db.insert("featureDocs", {
      workspaceId: args.workspaceId,
      title: args.title,
      content: args.content,
      number: nextNumber,
      status: "unclaimed",
      order: now,
      parentDocId,
      archived: false,
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
    parentDocId: v.optional(v.union(v.id("featureDocs"), v.null())),
    status: v.optional(
      v.union(
        v.literal("unclaimed"),
        v.literal("in_progress"),
        v.literal("done")
      )
    ),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, parentDocId, ...updates } = args;
    const doc = await ctx.db.get(id);
    if (!doc) {
      throw new Error("Feature doc not found");
    }
    const patch: Record<string, unknown> = { ...updates };
    if (parentDocId !== undefined) {
      if (parentDocId === null) {
        patch.parentDocId = undefined;
      } else {
        if (parentDocId === id) {
          throw new Error("Feature doc cannot be its own parent");
        }
        const parent = await ctx.db.get(parentDocId);
        if (!parent || parent.workspaceId !== doc.workspaceId) {
          throw new Error("Invalid parent doc");
        }
        patch.parentDocId = parentDocId;
      }
    }
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("featureDocs"),
    status: v.union(
      v.literal("unclaimed"),
      v.literal("in_progress"),
      v.literal("done")
    ),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Feature doc not found");
    }
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const move = mutation({
  args: {
    id: v.id("featureDocs"),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Feature doc not found");
    }
    await ctx.db.patch(args.id, {
      order: args.order,
      updatedAt: Date.now(),
    });
  },
});

export const setArchived = mutation({
  args: {
    id: v.id("featureDocs"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Feature doc not found");
    }

    await ctx.db.patch(args.id, {
      archived: args.archived,
      updatedAt: Date.now(),
    });

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_workspace_doc", (q) =>
        q.eq("workspaceId", doc.workspaceId).eq("docId", args.id)
      )
      .collect();

    for (const ticket of tickets) {
      await ctx.db.patch(ticket._id, {
        archived: args.archived,
        updatedAt: Date.now(),
      });
    }
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
