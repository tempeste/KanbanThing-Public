import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";

/**
 * Migration to assign existing workspaces (without owners) to a user.
 * This allows the first authenticated user to claim orphaned workspaces.
 */
export const assignOrphanedWorkspaces = internalMutation({
  args: {
    betterAuthUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find workspaces without any members
    const allWorkspaces = await ctx.db.query("workspaces").collect();
    const claimed: string[] = [];

    for (const workspace of allWorkspaces) {
      // Check if workspace has any members
      const members = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .first();

      if (!members) {
        // No members - claim this workspace
        await ctx.db.insert("workspaceMembers", {
          workspaceId: workspace._id,
          betterAuthUserId: args.betterAuthUserId,
          role: "owner",
          createdAt: Date.now(),
        });

        // Update workspace createdBy if not set
        if (!workspace.createdBy) {
          await ctx.db.patch(workspace._id, {
            createdBy: args.betterAuthUserId,
          });
        }

        claimed.push(workspace.name);
      }
    }

    return { claimed, count: claimed.length };
  },
});

const runBackfillUserProfiles = async (
  ctx: MutationCtx,
  workspaceId?: Id<"workspaces">
) => {
  const members = workspaceId
    ? await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect()
    : await ctx.db.query("workspaceMembers").collect();
  const uniqueIds = Array.from(
    new Set(
      members
        .map((member) => member.betterAuthUserId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  let synced = 0;
  const missing: string[] = [];

  for (const betterAuthUserId of uniqueIds) {
    const authUser = await authComponent.getAnyUserById(ctx, betterAuthUserId);
    if (!authUser || !authUser.email) {
      missing.push(betterAuthUserId);
      continue;
    }

    const normalizedEmail = authUser.email.toLowerCase();
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_betterAuthUserId", (q) =>
        q.eq("betterAuthUserId", betterAuthUserId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: normalizedEmail,
        name: authUser.name ?? undefined,
        image: authUser.image ?? undefined,
        lastSyncedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userProfiles", {
        betterAuthUserId,
        email: normalizedEmail,
        name: authUser.name ?? undefined,
        image: authUser.image ?? undefined,
        lastSyncedAt: Date.now(),
      });
    }

    synced += 1;
  }

  return { synced, missing };
};

export const backfillUserProfilesFromMembers = mutation({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (args.workspaceId) {
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q
            .eq("workspaceId", args.workspaceId!)
            .eq("betterAuthUserId", user._id)
        )
        .first();

      if (!membership || membership.role !== "owner") {
        throw new ConvexError("Only workspace owners can run this backfill.");
      }
    } else {
      const memberships = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_user", (q) => q.eq("betterAuthUserId", user._id))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();

      if (memberships.length === 0) {
        throw new ConvexError("Only workspace owners can run this backfill.");
      }
    }

    return await runBackfillUserProfiles(ctx, args.workspaceId);
  },
});

export const backfillUserProfilesFromMembersInternal = internalMutation({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    return await runBackfillUserProfiles(ctx, args.workspaceId);
  },
});
