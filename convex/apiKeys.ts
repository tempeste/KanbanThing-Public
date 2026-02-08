import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { authComponent } from "./auth";

type AccessCtx = MutationCtx | QueryCtx;

const isAdminApiKey = (key: { role?: "admin" | "agent" }) =>
  key.role === undefined || key.role === "admin";

const requireWorkspaceMemberAccess = async (
  ctx: AccessCtx,
  workspaceId: Id<"workspaces">,
  agentApiKeyId?: Id<"apiKeys">
) => {
  if (agentApiKeyId) {
    const apiKey = await ctx.db.get(agentApiKeyId);
    if (!apiKey || apiKey.workspaceId !== workspaceId) {
      throw new Error("Unauthorized");
    }
    return;
  }

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

  if (!membership) {
    throw new Error("Unauthorized");
  }
};

const requireKeyManagementAccess = async (
  ctx: AccessCtx,
  workspaceId: Id<"workspaces">,
  agentApiKeyId?: Id<"apiKeys">
) => {
  if (agentApiKeyId) {
    const apiKey = await ctx.db.get(agentApiKeyId);
    if (!apiKey || apiKey.workspaceId !== workspaceId || !isAdminApiKey(apiKey)) {
      throw new Error("Unauthorized");
    }
    return;
  }

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

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new Error("Unauthorized");
  }
};

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMemberAccess(ctx, args.workspaceId, args.agentApiKeyId);
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

export const get = query({
  args: {
    id: v.id("apiKeys"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.id);
    if (!key) return null;
    await requireKeyManagementAccess(ctx, key.workspaceId, args.agentApiKeyId);
    return key;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    keyHash: v.string(),
    name: v.string(),
    role: v.optional(v.union(v.literal("admin"), v.literal("agent"))),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireKeyManagementAccess(ctx, args.workspaceId, args.agentApiKeyId);
    return await ctx.db.insert("apiKeys", {
      workspaceId: args.workspaceId,
      keyHash: args.keyHash,
      name: args.name,
      role: args.role ?? "agent",
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("apiKeys"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.id);
    if (!key) {
      throw new Error("API key not found");
    }
    await requireKeyManagementAccess(ctx, key.workspaceId, args.agentApiKeyId);
    await ctx.db.delete(args.id);
  },
});

export const updateRole = mutation({
  args: {
    id: v.id("apiKeys"),
    role: v.union(v.literal("admin"), v.literal("agent")),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.id);
    if (!key) {
      throw new Error("API key not found");
    }

    await requireKeyManagementAccess(ctx, key.workspaceId, args.agentApiKeyId);

    if (args.agentApiKeyId === args.id && args.role === "agent") {
      throw new Error("Cannot demote the API key used for this request");
    }

    await ctx.db.patch(args.id, { role: args.role });
  },
});
