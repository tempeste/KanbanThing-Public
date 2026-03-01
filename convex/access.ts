import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUserOrNull } from "./auth";

type AccessCtx = MutationCtx | QueryCtx;

export const hasWorkspaceAccess = async (
  ctx: AccessCtx,
  workspaceId: Id<"workspaces">,
  agentApiKeyId?: Id<"apiKeys">
) => {
  if (agentApiKeyId) {
    const apiKey = await ctx.db.get(agentApiKeyId);
    return Boolean(apiKey && apiKey.workspaceId === workspaceId);
  }

  const authUser = await getAuthUserOrNull(ctx);
  if (!authUser) {
    return false;
  }

  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("betterAuthUserId", authUser._id)
    )
    .first();

  return Boolean(membership);
};

export const requireWorkspaceAccess = async (
  ctx: AccessCtx,
  workspaceId: Id<"workspaces">,
  agentApiKeyId?: Id<"apiKeys">
) => {
  const allowed = await hasWorkspaceAccess(ctx, workspaceId, agentApiKeyId);
  if (!allowed) {
    throw new Error("Unauthorized");
  }
};
