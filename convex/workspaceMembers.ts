import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    betterAuthUserId: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    // Check if membership already exists
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();

    if (existing) {
      throw new Error("User is already a member of this workspace");
    }

    return await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      betterAuthUserId: args.betterAuthUserId,
      role: args.role,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    betterAuthUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();

    if (!membership) {
      throw new Error("Membership not found");
    }

    // Prevent removing the last owner
    if (membership.role === "owner") {
      const owners = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();

      if (owners.length <= 1) {
        throw new Error("Cannot remove the last owner of a workspace");
      }
    }

    await ctx.db.delete(membership._id);
  },
});

export const updateRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    betterAuthUserId: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();

    if (!membership) {
      throw new Error("Membership not found");
    }

    // Prevent demoting the last owner
    if (membership.role === "owner" && args.role !== "owner") {
      const owners = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();

      if (owners.length <= 1) {
        throw new Error("Cannot demote the last owner of a workspace");
      }
    }

    await ctx.db.patch(membership._id, { role: args.role });
  },
});

export const listByWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const listByUser = query({
  args: { betterAuthUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("betterAuthUserId", args.betterAuthUserId))
      .collect();
  },
});

export const hasAccess = query({
  args: {
    workspaceId: v.id("workspaces"),
    betterAuthUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();

    return membership !== null;
  },
});

export const canManage = query({
  args: {
    workspaceId: v.id("workspaces"),
    betterAuthUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();

    if (!membership) return false;
    return membership.role === "owner" || membership.role === "admin";
  },
});

export const getMembership = query({
  args: {
    workspaceId: v.id("workspaces"),
    betterAuthUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();
  },
});
