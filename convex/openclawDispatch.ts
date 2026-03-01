import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { logTicketActivity } from "./activityHelpers";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const truncateForScheduler = (value: string | undefined, maxLength: number) => {
  if (!value) return value;
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
};

const dispatchSnapshotValidator = v.object({
  ticketId: v.id("tickets"),
  title: v.string(),
  number: v.optional(v.number()),
  description: v.optional(v.string()),
  previousStatus: v.union(
    v.literal("backlog"),
    v.literal("unclaimed"),
    v.literal("dispatched"),
    v.literal("in_progress"),
    v.literal("done")
  ),
  previousOwnerId: v.optional(v.string()),
  previousOwnerType: v.optional(v.union(v.literal("user"), v.literal("agent"))),
  previousOwnerDisplayName: v.optional(v.string()),
});

const getAuthUser = async (ctx: any) => {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Unauthorized");
  return user;
};

const getReadableUserDisplayName = (user: { name?: string | null; email?: string | null }) =>
  user.name ?? user.email ?? "Authenticated user";

export const dispatchTickets = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    ticketIds: v.array(v.id("tickets")),
    instanceId: v.id("openclawInstances"),
    callbackBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    if (args.ticketIds.length === 0) {
      throw new Error("At least one ticket is required");
    }

    const ticketIds = [...new Set(args.ticketIds)] as Id<"tickets">[];

    if (ticketIds.length > 100) {
      throw new Error("Cannot dispatch more than 100 tickets at once");
    }

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("betterAuthUserId", authUser._id)
      )
      .first();
    if (!membership) {
      throw new Error("Unauthorized");
    }

    const instance = await ctx.db.get(args.instanceId);
    if (!instance || instance.userId !== authUser._id) {
      throw new Error("OpenClaw instance not found");
    }

    const snapshots: Array<{
      ticketId: Id<"tickets">;
      title: string;
      number?: number;
      description?: string;
      previousStatus: "backlog" | "unclaimed" | "dispatched" | "in_progress" | "done";
      previousOwnerId?: string;
      previousOwnerType?: "user" | "agent";
      previousOwnerDisplayName?: string;
    }> = [];

    for (const ticketId of ticketIds) {
      const ticket = await ctx.db.get(ticketId);
      if (!ticket || ticket.workspaceId !== args.workspaceId) {
        throw new Error("One or more tickets are invalid");
      }
      if (ticket.status === "done" || ticket.status === "dispatched") {
        throw new Error(`Ticket ${ticket.number ?? ticket._id} cannot be dispatched from ${ticket.status}`);
      }
      snapshots.push({
        ticketId: ticket._id,
        title: ticket.title,
        number: ticket.number,
        description: ticket.description,
        previousStatus: ticket.status,
        previousOwnerId: ticket.ownerId,
        previousOwnerType: ticket.ownerType,
        previousOwnerDisplayName: ticket.ownerDisplayName,
      });

      await ctx.db.patch(ticket._id, {
        status: "dispatched",
        ownerId: `openclaw:${instance._id}`,
        ownerType: "agent",
        ownerDisplayName: instance.name,
        updatedAt: Date.now(),
      });

      await logTicketActivity(ctx, {
        workspaceId: args.workspaceId,
        ticketId: ticket._id,
        type: "ticket_status_changed",
        data: {
          from: ticket.status,
          to: "dispatched",
          transitionClass: ticket.status === "unclaimed" ? "standard" : "non_standard",
          reason: "Dispatched to OpenClaw",
        },
        actor: {
          type: "user",
          id: authUser._id,
          displayName: getReadableUserDisplayName(authUser),
        },
      });
    }

    const truncatedSnapshots = snapshots.map((s) => ({
      ...s,
      description: truncateForScheduler(s.description, 300),
    }));

    await ctx.scheduler.runAfter(0, internal.openclawDispatchActions.executeDispatch, {
      workspaceId: args.workspaceId,
      workspaceName: workspace.name,
      workspaceDocs: truncateForScheduler(workspace.docs, 600),
      instanceId: args.instanceId,
      ...(args.callbackBaseUrl ? { callbackBaseUrl: args.callbackBaseUrl } : {}),
      instanceName: instance.name,
      userId: authUser._id,
      userDisplayName: getReadableUserDisplayName(authUser),
      snapshots: truncatedSnapshots,
    });

    return { success: true, count: snapshots.length };
  },
});

export const markDispatchSuccess = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    instanceId: v.id("openclawInstances"),
    instanceName: v.string(),
    userId: v.string(),
    userDisplayName: v.string(),
    runId: v.optional(v.string()),
    snapshots: v.array(dispatchSnapshotValidator),
  },
  handler: async (ctx, args) => {
    for (const snapshot of args.snapshots) {
      await ctx.db.patch(snapshot.ticketId, {
        lastDispatchRunId: args.runId,
        lastDispatchInstanceId: args.instanceId,
        lastDispatchInstanceName: args.instanceName,
        lastDispatchUserId: args.userId,
        lastDispatchUserDisplayName: args.userDisplayName,
        lastDispatchAt: Date.now(),
        updatedAt: Date.now(),
      });

      await logTicketActivity(ctx, {
        workspaceId: args.workspaceId,
        ticketId: snapshot.ticketId,
        type: "ticket_dispatched",
        data: {
          instanceName: args.instanceName,
          instanceId: args.instanceId,
          userId: args.userId,
          userDisplayName: args.userDisplayName,
          runId: args.runId ?? null,
          batchSize: args.snapshots.length,
        },
        actor: {
          type: "user",
          id: args.userId,
          displayName: args.userDisplayName,
        },
      });
    }
  },
});

export const revertDispatchFailure = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    error: v.string(),
    snapshots: v.array(dispatchSnapshotValidator),
  },
  handler: async (ctx, args) => {
    for (const snapshot of args.snapshots) {
      const ticket = await ctx.db.get(snapshot.ticketId);
      if (!ticket || ticket.workspaceId !== args.workspaceId) continue;
      if (ticket.status !== "dispatched") continue;

      await ctx.db.patch(snapshot.ticketId, {
        status: snapshot.previousStatus,
        ownerId: snapshot.previousOwnerId,
        ownerType: snapshot.previousOwnerType,
        ownerDisplayName: snapshot.previousOwnerDisplayName,
        updatedAt: Date.now(),
      });

      await logTicketActivity(ctx, {
        workspaceId: args.workspaceId,
        ticketId: snapshot.ticketId,
        type: "ticket_status_changed",
        data: {
          from: "dispatched",
          to: snapshot.previousStatus,
          transitionClass: "non_standard",
          reason: `OpenClaw dispatch failed: ${args.error}`,
        },
        actor: {
          type: "system",
          id: "openclaw-dispatch",
          displayName: "OpenClaw Dispatch",
        },
      });

      await logTicketActivity(ctx, {
        workspaceId: args.workspaceId,
        ticketId: snapshot.ticketId,
        type: "ticket_dispatch_failed",
        data: { error: args.error },
        actor: {
          type: "system",
          id: "openclaw-dispatch",
          displayName: "OpenClaw Dispatch",
        },
      });
    }
  },
});

export const logCancellationAttempt = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    ticketIds: v.array(v.id("tickets")),
    runId: v.string(),
    instanceName: v.string(),
    userId: v.string(),
    userDisplayName: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    for (const ticketId of args.ticketIds) {
      const ticket = await ctx.db.get(ticketId);
      if (!ticket || ticket.workspaceId !== args.workspaceId) continue;
      await logTicketActivity(ctx, {
        workspaceId: args.workspaceId,
        ticketId,
        type: "ticket_dispatch_cancelled",
        data: {
          runId: args.runId,
          instanceName: args.instanceName,
          ...(args.error ? { reason: args.error } : {}),
        },
        actor: {
          type: "user",
          id: args.userId,
          displayName: args.userDisplayName,
        },
      });
    }
  },
});
