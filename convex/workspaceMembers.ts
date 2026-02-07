import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

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

export const addByEmails = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    emails: v.array(v.string()),
    role: v.optional(
      v.union(v.literal("owner"), v.literal("admin"), v.literal("member"))
    ),
  },
  handler: async (ctx, args) => {
    if (args.emails.length > 100) {
      throw new Error("Cannot add more than 100 members at once");
    }

    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Unauthorized");
    }

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("betterAuthUserId", authUser._id)
      )
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Not authorized to add members to this workspace");
    }

    const role = args.role ?? "member";
    const results: {
      added: string[];
      alreadyMember: string[];
      notFound: string[];
    } = {
      added: [],
      alreadyMember: [],
      notFound: [],
    };

    for (const email of args.emails) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) continue;

      // Look up user profile by email
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .first();

      if (!profile) {
        results.notFound.push(normalizedEmail);
        continue;
      }

      // Check if already a member
      const existing = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("betterAuthUserId", profile.betterAuthUserId)
        )
        .first();

      if (existing) {
        results.alreadyMember.push(normalizedEmail);
        continue;
      }

      // Add as member
      await ctx.db.insert("workspaceMembers", {
        workspaceId: args.workspaceId,
        betterAuthUserId: profile.betterAuthUserId,
        role,
        createdAt: Date.now(),
      });
      results.added.push(normalizedEmail);
    }

    return results;
  },
});
