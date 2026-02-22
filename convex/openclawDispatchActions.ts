"use node";

import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { decryptOpenClawToken } from "../lib/openclaw-crypto";
import { buildOpenClawDispatchMessage } from "../lib/openclaw-dispatch";
import { getOpenClawInstanceUrlValidationError } from "../lib/openclaw-instance-validation";

const withHooksPath = (rawUrl: string) => {
  const normalized = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  return `${normalized}/hooks/agent`;
};

const getEncryptionKey = () => {
  const key = process.env.OPENCLAW_ENCRYPTION_KEY;
  if (!key) throw new Error("OPENCLAW_ENCRYPTION_KEY is not configured");
  return key;
};

const postToOpenClaw = async (args: {
  url: string;
  token: string;
  message: string;
}) => {
  const urlError = getOpenClawInstanceUrlValidationError(args.url);
  if (urlError) {
    throw new Error(urlError);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(withHooksPath(args.url), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: args.message,
        agentId: "main",
        deliver: true,
      }),
      signal: controller.signal,
    });
    const bodyText = await response.text();
    let bodyJson: Record<string, unknown> | null = null;
    if (bodyText) {
      try {
        bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
      } catch {
        bodyJson = null;
      }
    }

    if (!response.ok) {
      const message =
        response.status >= 500
          ? "OpenClaw server error"
          : (bodyJson?.error as string | undefined) ??
            (bodyJson?.message as string | undefined) ??
            `OpenClaw request failed (${response.status})`;
      throw new Error(message);
    }

    return {
      runId:
        (bodyJson?.runId as string | undefined) ??
        (bodyJson?.id as string | undefined) ??
        undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const executeDispatch = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    workspaceName: v.string(),
    instanceId: v.id("openclawInstances"),
    instanceName: v.string(),
    userId: v.string(),
    userDisplayName: v.string(),
    snapshots: v.array(
      v.object({
        ticketId: v.id("tickets"),
        title: v.string(),
        number: v.optional(v.number()),
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
      })
    ),
  },
  handler: async (ctx, args) => {
    try {
      const instance = await ctx.runQuery(
        internal.openclawInstances.getOwnedEncryptedForDispatch,
        { id: args.instanceId, userId: args.userId }
      );
      if (!instance) {
        throw new Error("OpenClaw instance not found");
      }

      const token = await decryptOpenClawToken(instance.encryptedToken, getEncryptionKey());
      const message = buildOpenClawDispatchMessage({
        workspaceName: args.workspaceName,
        workspaceId: args.workspaceId,
        tickets: args.snapshots.map((snapshot) => ({
          _id: snapshot.ticketId,
          title: snapshot.title,
          number: snapshot.number,
        })),
      });

      const result = await postToOpenClaw({
        url: instance.url,
        token,
        message,
      });

      await ctx.runMutation(internal.openclawDispatch.markDispatchSuccess, {
        workspaceId: args.workspaceId,
        instanceId: args.instanceId,
        instanceName: args.instanceName,
        userId: args.userId,
        userDisplayName: args.userDisplayName,
        runId: result.runId,
        snapshots: args.snapshots,
      });

      return { success: true, runId: result.runId ?? null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "OpenClaw dispatch failed";
      await ctx.runMutation(internal.openclawDispatch.revertDispatchFailure, {
        workspaceId: args.workspaceId,
        error: message,
        snapshots: args.snapshots,
      });
      return { success: false, error: message };
    }
  },
});

export const cancelDispatch = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    instanceId: v.id("openclawInstances"),
    runId: v.string(),
    ticketIds: v.array(v.id("tickets")),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(api.openclawInstances.getCurrentUserId, {});
    const hasMembership = await ctx.runQuery(internal.workspaceMembers.hasMembershipForUserId, {
      workspaceId: args.workspaceId,
      betterAuthUserId: userId,
    });
    if (!hasMembership) {
      throw new Error("Unauthorized");
    }
    const instance = await ctx.runQuery(internal.openclawInstances.getOwnedEncryptedForDispatch, {
      id: args.instanceId,
      userId,
    });
    if (!instance) {
      throw new Error("OpenClaw instance not found");
    }

    const token = await decryptOpenClawToken(instance.encryptedToken, getEncryptionKey());
    const cancellationMessage =
      `KanbanThing cancellation request for runId ${args.runId}. ` +
      "Please stop working on tickets for this dispatch if still running.";

    let errorMessage: string | undefined;
    try {
      await postToOpenClaw({
        url: instance.url,
        token,
        message: cancellationMessage,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Cancellation request failed";
    }

    await ctx.runMutation(internal.openclawDispatch.logCancellationAttempt, {
      workspaceId: args.workspaceId,
      ticketIds: args.ticketIds,
      runId: args.runId,
      instanceName: instance.name,
      userId,
      userDisplayName: userId,
      ...(errorMessage ? { error: errorMessage } : {}),
    });

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return { success: true };
  },
});
