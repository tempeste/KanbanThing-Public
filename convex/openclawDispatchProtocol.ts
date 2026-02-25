import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireWorkspaceAccess } from "./access";
import { logTicketActivity } from "./activityHelpers";

const dispatchEventTypeValidator = v.union(
  v.literal("dispatch.received"),
  v.literal("dispatch.started"),
  v.literal("dispatch.finished"),
  v.literal("dispatch.failed"),
  v.literal("dispatch.cancel_ack"),
  v.literal("dispatch.cancel_result"),
  v.literal("ticket.progress"),
  v.literal("ticket.blocked"),
  v.literal("ticket.failed"),
  v.literal("ticket.finished")
);

const eventTypeToActivityType: Record<
  | "dispatch.received"
  | "dispatch.started"
  | "dispatch.finished"
  | "dispatch.failed"
  | "dispatch.cancel_ack"
  | "dispatch.cancel_result"
  | "ticket.progress"
  | "ticket.blocked"
  | "ticket.failed"
  | "ticket.finished",
  string
> = {
  "dispatch.received": "ticket_dispatch_received",
  "dispatch.started": "ticket_dispatch_started",
  "dispatch.finished": "ticket_dispatch_finished",
  "dispatch.failed": "ticket_dispatch_failed_callback",
  "dispatch.cancel_ack": "ticket_dispatch_cancel_acknowledged",
  "dispatch.cancel_result": "ticket_dispatch_cancel_result",
  "ticket.progress": "ticket_dispatch_progress",
  "ticket.blocked": "ticket_dispatch_blocked",
  "ticket.failed": "ticket_dispatch_ticket_failed",
  "ticket.finished": "ticket_dispatch_ticket_finished",
};

type DispatchEventType =
  | "dispatch.received"
  | "dispatch.started"
  | "dispatch.finished"
  | "dispatch.failed"
  | "dispatch.cancel_ack"
  | "dispatch.cancel_result"
  | "ticket.progress"
  | "ticket.blocked"
  | "ticket.failed"
  | "ticket.finished";

type DispatchExecutionState =
  | "acked"
  | "running"
  | "completed"
  | "failed"
  | "cancel_acknowledged"
  | "cancelled"
  | "too_late_to_cancel";

const deriveExecutionIdentity = (args: {
  dispatchId?: string;
  runId?: string;
  eventId?: string;
}) => {
  if (args.dispatchId) return args.dispatchId;
  if (args.runId) return `run:${args.runId}`;
  if (args.eventId) return `event:${args.eventId}`;
  return null;
};

const getMetadataString = (metadata: unknown, key: string): string | null => {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
};

const deriveExecutionState = (args: {
  eventType: DispatchEventType;
  metadata?: unknown;
}): DispatchExecutionState | null => {
  switch (args.eventType) {
    case "dispatch.received":
      return "acked";
    case "dispatch.started":
      return "running";
    case "dispatch.finished":
      return "completed";
    case "dispatch.failed":
      return "failed";
    case "dispatch.cancel_ack":
      return "cancel_acknowledged";
    case "dispatch.cancel_result": {
      const result = getMetadataString(args.metadata, "result")?.toLowerCase() ?? null;
      if (result === "cancelled") return "cancelled";
      if (result === "too_late" || result === "too_late_to_cancel") {
        return "too_late_to_cancel";
      }
      return "cancel_acknowledged";
    }
    default:
      return null;
  }
};

export const ingestPluginEvent = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    ticketIds: v.array(v.id("tickets")),
    eventType: dispatchEventTypeValidator,
    eventId: v.optional(v.string()),
    dispatchId: v.optional(v.string()),
    runId: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
    message: v.optional(v.string()),
    metadata: v.optional(v.any()),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);

    if (args.eventId) {
      const existingReceipt = await ctx.db
        .query("dispatchProtocolEventReceipts")
        .withIndex("by_workspace_event", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("eventId", args.eventId!)
        )
        .first();
      if (existingReceipt) {
        return {
          success: true,
          duplicate: true,
          count: 0,
          patchedRunIdCount: 0,
          executionUpserted: false,
          ...(existingReceipt.dispatchId ? { dispatchId: existingReceipt.dispatchId } : {}),
          ...(existingReceipt.runId ? { runId: existingReceipt.runId } : {}),
        };
      }
    }

    const ticketIds = [...new Set(args.ticketIds)] as Id<"tickets">[];
    const activityType = eventTypeToActivityType[args.eventType as DispatchEventType];
    const eventType = args.eventType as DispatchEventType;
    const processedTicketIds: Id<"tickets">[] = [];
    let patchedRunIdCount = 0;
    const eventTs = args.occurredAt ?? Date.now();
    const executionId = deriveExecutionIdentity({
      dispatchId: args.dispatchId,
      runId: args.runId,
      eventId: args.eventId,
    });
    const executionState = deriveExecutionState({ eventType, metadata: args.metadata });

    let executionUpserted = false;
    let executionDocId: Id<"dispatchExecutions"> | null = null;
    if (executionId) {
      const existing = await ctx.db
        .query("dispatchExecutions")
        .withIndex("by_workspace_dispatch", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("dispatchId", executionId)
        )
        .first();

      const basePatch: Record<string, unknown> = {
        ticketIds,
        lastEventType: eventType,
        updatedAt: Date.now(),
        ...(args.eventId ? { lastEventId: args.eventId } : {}),
        ...(args.message ? { lastMessage: args.message } : {}),
        ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      };
      if (args.runId) {
        basePatch.runId = args.runId;
      }
      if (executionState) {
        basePatch.state = executionState;
      }
      if (typeof args.metadata?.kanbanthingDispatchVersion === "number") {
        basePatch.protocolVersion = args.metadata.kanbanthingDispatchVersion;
      }

      if (executionState === "acked") basePatch.ackAt = eventTs;
      if (executionState === "running") basePatch.startedAt = eventTs;
      if (eventType === "dispatch.cancel_ack") {
        basePatch.cancelAckAt = eventTs;
      }
      if (eventType === "dispatch.cancel_result") {
        basePatch.cancelResultAt = eventTs;
      }
      if (executionState === "completed") basePatch.completedAt = eventTs;
      if (executionState === "failed") {
        basePatch.failedAt = eventTs;
        if (args.message) basePatch.error = args.message;
      }

      if (existing) {
        await ctx.db.patch(existing._id, basePatch);
        executionDocId = existing._id;
      } else {
        executionDocId = await ctx.db.insert("dispatchExecutions", {
          workspaceId: args.workspaceId,
          dispatchId: executionId,
          state: executionState ?? "acked",
          ticketIds,
          lastEventType: eventType,
          ...(args.runId ? { runId: args.runId } : {}),
          ...(args.eventId ? { lastEventId: args.eventId } : {}),
          ...(args.message ? { lastMessage: args.message } : {}),
          ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
          ...(typeof args.metadata?.kanbanthingDispatchVersion === "number"
            ? { protocolVersion: args.metadata.kanbanthingDispatchVersion }
            : {}),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...(executionState === "acked" ? { ackAt: eventTs } : {}),
          ...(executionState === "running" ? { startedAt: eventTs } : {}),
          ...(eventType === "dispatch.cancel_ack" ? { cancelAckAt: eventTs } : {}),
          ...(eventType === "dispatch.cancel_result" ? { cancelResultAt: eventTs } : {}),
          ...(executionState === "completed" ? { completedAt: eventTs } : {}),
          ...(executionState === "failed" ? { failedAt: eventTs } : {}),
          ...(executionState === "failed" && args.message ? { error: args.message } : {}),
        });
      }
      executionUpserted = true;
    }

    if (args.eventId) {
      await ctx.db.insert("dispatchProtocolEventReceipts", {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        eventType,
        ...(args.dispatchId ? { dispatchId: args.dispatchId } : {}),
        ...(args.runId ? { runId: args.runId } : {}),
        createdAt: Date.now(),
      });
    }

    for (const ticketId of ticketIds) {
      const ticket = await ctx.db.get(ticketId);
      if (!ticket) continue;
      if (ticket.workspaceId !== args.workspaceId) {
        throw new Error("Ticket does not belong to workspace");
      }

      if (
        args.runId &&
        (args.eventType === "dispatch.received" || args.eventType === "dispatch.started")
      ) {
        await ctx.db.patch(ticketId, {
          lastDispatchRunId: args.runId,
          lastDispatchAt: Date.now(),
          updatedAt: Date.now(),
        });
        patchedRunIdCount += 1;
      }

      await logTicketActivity(ctx, {
        workspaceId: args.workspaceId,
        ticketId,
        type: activityType,
        data: {
          eventType: args.eventType,
          ...(executionDocId ? { dispatchExecutionId: executionDocId } : {}),
          ...(args.eventId ? { eventId: args.eventId } : {}),
          ...(args.dispatchId ? { dispatchId: args.dispatchId } : {}),
          ...(args.runId ? { runId: args.runId } : {}),
          ...(args.occurredAt ? { occurredAt: args.occurredAt } : {}),
          ...(args.message ? { message: args.message } : {}),
          ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
        },
        actor: {
          type: "agent",
          id: "openclaw-plugin",
          displayName: "OpenClaw Plugin",
        },
      });

      processedTicketIds.push(ticketId);
    }

    return {
      success: true,
      duplicate: false,
      count: processedTicketIds.length,
      patchedRunIdCount,
      executionUpserted,
      ...(executionDocId ? { dispatchExecutionId: executionDocId } : {}),
    };
  },
});
