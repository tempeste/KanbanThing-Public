import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Migration to assign existing workspaces (without owners) to a user.
 * This allows the first authenticated user to claim orphaned workspaces.
 */
export const assignOrphanedWorkspaces = mutation({
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
