import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { generateWorkspacePrefix } from "./prefix";
import { actorValidator, resolveActor } from "./activityHelpers";
import { authComponent } from "./auth";
import { requireWorkspaceAccess } from "./access";

const requireWorkspaceOwner = async (
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
) => {
  const authUser = await authComponent.getAuthUser(ctx);
  if (!authUser) {
    throw new Error("Unauthorized");
  }

  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("betterAuthUserId", authUser._id)
    )
    .first();

  if (!membership || membership.role !== "owner") {
    throw new Error("Only workspace owners can delete workspaces");
  }
};

const deleteWorkspaceData = async (
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
) => {
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const ticket of tickets) {
    const comments = await ctx.db
      .query("ticketComments")
      .withIndex("by_ticket_createdAt", (q) => q.eq("ticketId", ticket._id))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    const activities = await ctx.db
      .query("ticketActivities")
      .withIndex("by_ticket_createdAt", (q) => q.eq("ticketId", ticket._id))
      .collect();
    for (const activity of activities) {
      await ctx.db.delete(activity._id);
    }

    await ctx.db.delete(ticket._id);
  }

  const apiKeys = await ctx.db
    .query("apiKeys")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const apiKey of apiKeys) {
    await ctx.db.delete(apiKey._id);
  }

  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const membership of memberships) {
    await ctx.db.delete(membership._id);
  }

  const docsVersions = await ctx.db
    .query("workspaceDocsVersions")
    .withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const version of docsVersions) {
    await ctx.db.delete(version._id);
  }

  await ctx.db.delete(workspaceId);
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) return [];

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("betterAuthUserId", authUser._id))
      .collect();

    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId);
        return workspace ? { ...workspace, role: membership.role } : null;
      })
    );

    return workspaces.filter((workspace) => workspace !== null);
  },
});

export const get = query({
  args: {
    id: v.id("workspaces"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.id);
    if (!workspace) return null;
    await requireWorkspaceAccess(ctx, workspace._id, args.agentApiKeyId);
    return workspace;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    docs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Unauthorized");
    }
    const prefix = generateWorkspacePrefix(args.name);
    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      docs: args.docs,
      prefix,
      ticketCounter: 0,
      createdBy: authUser._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      betterAuthUserId: authUser._id,
      role: "owner",
      createdAt: now,
    });

    return workspaceId;
  },
});

export const createWithOwner = mutation({
  args: {
    name: v.string(),
    docs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Unauthorized");
    }
    const prefix = generateWorkspacePrefix(args.name);
    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      docs: args.docs,
      prefix,
      ticketCounter: 0,
      createdBy: authUser._id,
      createdAt: now,
      updatedAt: now,
    });

    // Add the creator as owner
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      betterAuthUserId: authUser._id,
      role: "owner",
      createdAt: now,
    });

    return workspaceId;
  },
});

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) return [];

    // Get all memberships for this user
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("betterAuthUserId", authUser._id))
      .collect();

    // Fetch the workspaces
    const workspaces = await Promise.all(
      memberships.map(async (m) => {
        const workspace = await ctx.db.get(m.workspaceId);
        return workspace ? { ...workspace, role: m.role } : null;
      })
    );

    return workspaces.filter((w) => w !== null);
  },
});

export const listSidebar = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) return [];

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("betterAuthUserId", authUser._id))
      .collect();

    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId);
        if (!workspace) return null;
        return {
          _id: workspace._id,
          name: workspace.name,
          role: membership.role,
          prefix: workspace.prefix,
          ticketCounter: workspace.ticketCounter,
          updatedAt: workspace.updatedAt,
        };
      })
    );

    return workspaces.filter((workspace) => workspace !== null);
  },
});

export const removeWithCleanup = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceOwner(ctx, args.id);
    await deleteWorkspaceData(ctx, args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id("workspaces"),
    name: v.optional(v.string()),
    docs: v.optional(v.string()),
    prefix: v.optional(v.string()),
    actor: v.optional(actorValidator),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.id);
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    await requireWorkspaceAccess(ctx, workspace._id, args.agentApiKeyId);
    const updates: Record<string, string | undefined | number> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.docs !== undefined) updates.docs = args.docs;
    if (args.prefix !== undefined) updates.prefix = args.prefix;
    if (Object.keys(updates).length === 0) return;
    updates.updatedAt = Date.now();
    await ctx.db.patch(args.id, updates);

    if (args.docs !== undefined && args.docs !== workspace.docs) {
      const resolved = await resolveActor(ctx, args.actor);
      await ctx.db.insert("workspaceDocsVersions", {
        workspaceId: args.id,
        docs: args.docs,
        actorType: resolved.actorType,
        actorId: resolved.actorId,
        actorDisplayName: resolved.actorDisplayName,
        createdAt: Date.now(),
      });
    }
  },
});

export const listDocsVersions = query({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("workspaceDocsVersions")
      .withIndex("by_workspace_createdAt", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .order("desc")
      .take(limit);
  },
});

export const remove = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceOwner(ctx, args.id);
    await deleteWorkspaceData(ctx, args.id);
  },
});

export const backfillIdentifiers = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Unauthorized");
    }

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.id).eq("betterAuthUserId", authUser._id)
      )
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Not authorized to backfill workspace identifiers");
    }

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
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Unauthorized");
    }

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.id).eq("betterAuthUserId", authUser._id)
      )
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Not authorized to reset workspace tickets");
    }

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
      updatedAt: Date.now(),
    });
  },
});

export const resetAllTickets = internalMutation({
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
        updatedAt: Date.now(),
      });
    }
  },
});
