import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

type AccessCtx = MutationCtx | QueryCtx;

export const requireWorkspaceAccess = async (
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
