import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireWorkspaceAccess } from "./access";

const MAX_TAG_NAME = 50;
const MAX_TAGS_PER_WORKSPACE = 50;

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);
    const tags = await ctx.db
      .query("workspaceTags")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    tags.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
    return tags;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    color: v.string(),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);

    const name = args.name.trim();
    if (!name) throw new Error("Tag name is required");
    if (name.length > MAX_TAG_NAME) {
      throw new Error(`Tag name cannot exceed ${MAX_TAG_NAME} characters`);
    }

    const existing = await ctx.db
      .query("workspaceTags")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    if (existing.length >= MAX_TAGS_PER_WORKSPACE) {
      throw new Error(`Cannot create more than ${MAX_TAGS_PER_WORKSPACE} tags`);
    }
    if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A tag with this name already exists");
    }

    return await ctx.db.insert("workspaceTags", {
      workspaceId: args.workspaceId,
      name,
      color: args.color,
      order: Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("workspaceTags"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.id);
    if (!tag) throw new Error("Tag not found");
    await requireWorkspaceAccess(ctx, tag.workspaceId, args.agentApiKeyId);

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Tag name is required");
      if (name.length > MAX_TAG_NAME) {
        throw new Error(`Tag name cannot exceed ${MAX_TAG_NAME} characters`);
      }
      if (name.toLowerCase() !== tag.name.toLowerCase()) {
        const existing = await ctx.db
          .query("workspaceTags")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", tag.workspaceId))
          .collect();
        if (existing.some((t) => t._id !== args.id && t.name.toLowerCase() === name.toLowerCase())) {
          throw new Error("A tag with this name already exists");
        }
      }
      updates.name = name;
    }

    if (args.color !== undefined) {
      updates.color = args.color;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }
  },
});

export const remove = mutation({
  args: {
    id: v.id("workspaceTags"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.id);
    if (!tag) return;
    await requireWorkspaceAccess(ctx, tag.workspaceId, args.agentApiKeyId);

    // Strip this tag from all tickets that reference it
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", tag.workspaceId))
      .collect();

    for (const ticket of tickets) {
      if (ticket.tags && ticket.tags.includes(args.id)) {
        await ctx.db.patch(ticket._id, {
          tags: ticket.tags.filter((t) => t !== args.id),
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(args.id);
  },
});
