import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";

export const actorValidator = v.object({
  type: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
  id: v.string(),
  displayName: v.optional(v.string()),
});

export type ActorInput = {
  type: "user" | "agent" | "system";
  id: string;
  displayName?: string;
};

export type ResolvedActor = {
  actorType: "user" | "agent" | "system";
  actorId: string;
  actorDisplayName?: string;
};

export const resolveActor = async (
  ctx: MutationCtx,
  actor?: ActorInput
): Promise<ResolvedActor> => {
  if (actor) {
    return {
      actorType: actor.type,
      actorId: actor.id,
      actorDisplayName: actor.displayName,
    };
  }

  const authUser = await authComponent.getAuthUser(ctx);
  if (authUser) {
    return {
      actorType: "user",
      actorId: authUser._id,
      actorDisplayName: authUser.name ?? authUser.email ?? String(authUser._id),
    };
  }

  return {
    actorType: "system",
    actorId: "system",
    actorDisplayName: "System",
  };
};

export const logTicketActivity = async (
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    ticketId: Id<"tickets">;
    type: string;
    data?: unknown;
    actor?: ActorInput;
  }
) => {
  const resolved = await resolveActor(ctx, args.actor);
  await ctx.db.insert("ticketActivities", {
    workspaceId: args.workspaceId,
    ticketId: args.ticketId,
    type: args.type,
    actorType: resolved.actorType,
    actorId: resolved.actorId,
    actorDisplayName: resolved.actorDisplayName,
    data: args.data,
    createdAt: Date.now(),
  });
};
