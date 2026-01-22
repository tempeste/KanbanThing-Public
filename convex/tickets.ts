import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const listByStatus = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.union(
      v.literal("unclaimed"),
      v.literal("in_progress"),
      v.literal("done")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", args.status)
      )
      .collect();
  },
});

export const get = query({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.string(),
    docs: v.optional(v.string()),
    docId: v.optional(v.id("featureDocs")),
  },
  handler: async (ctx, args) => {
    if (args.docId) {
      const doc = await ctx.db.get(args.docId);
      if (!doc || doc.workspaceId !== args.workspaceId) {
        throw new Error("Invalid feature doc");
      }
    }
    const now = Date.now();
    return await ctx.db.insert("tickets", {
      workspaceId: args.workspaceId,
      title: args.title,
      description: args.description,
      docs: args.docs,
      docId: args.docId,
      order: now,
      status: "unclaimed",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("tickets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    docs: v.optional(v.string()),
    docId: v.optional(v.union(v.id("featureDocs"), v.null())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, docId, ...updates } = args;
    const ticket = await ctx.db.get(id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    const patch: Record<string, unknown> = { ...updates };
    if (docId !== undefined) {
      if (docId === null) {
        patch.docId = undefined;
      } else {
        const doc = await ctx.db.get(docId);
        if (!doc || doc.workspaceId !== ticket.workspaceId) {
          throw new Error("Invalid feature doc");
        }
        patch.docId = docId;
      }
    }
    await ctx.db.patch(id, {
      ...patch,
      updatedAt: Date.now(),
    });
  },
});

export const listByDoc = query({
  args: {
    workspaceId: v.id("workspaces"),
    docId: v.id("featureDocs"),
    status: v.optional(
      v.union(
        v.literal("unclaimed"),
        v.literal("in_progress"),
        v.literal("done")
      )
    ),
  },
  handler: async (ctx, args) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_workspace_doc", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("docId", args.docId)
      )
      .collect();

    if (!args.status) {
      return tickets;
    }

    return tickets.filter((ticket) => ticket.status === args.status);
  },
});

export const claim = mutation({
  args: {
    id: v.id("tickets"),
    ownerId: v.string(),
    ownerType: v.union(v.literal("user"), v.literal("agent")),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    if (ticket.status !== "unclaimed") {
      throw new Error("Ticket is not available to claim");
    }
    await ctx.db.patch(args.id, {
      status: "in_progress",
      ownerId: args.ownerId,
      ownerType: args.ownerType,
      updatedAt: Date.now(),
    });
  },
});

export const complete = mutation({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    if (ticket.status !== "in_progress") {
      throw new Error("Ticket must be in progress to complete");
    }
    await ctx.db.patch(args.id, {
      status: "done",
      updatedAt: Date.now(),
    });
  },
});

export const unclaim = mutation({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    await ctx.db.patch(args.id, {
      status: "unclaimed",
      ownerId: undefined,
      ownerType: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tickets"),
    status: v.union(
      v.literal("unclaimed"),
      v.literal("in_progress"),
      v.literal("done")
    ),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.status === "unclaimed") {
      updates.ownerId = undefined;
      updates.ownerType = undefined;
    }
    await ctx.db.patch(args.id, updates);
  },
});

export const move = mutation({
  args: {
    id: v.id("tickets"),
    status: v.union(
      v.literal("unclaimed"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    const updates: Record<string, unknown> = {
      status: args.status,
      order: args.order,
      updatedAt: Date.now(),
    };
    if (args.status === "unclaimed") {
      updates.ownerId = undefined;
      updates.ownerType = undefined;
    }
    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
