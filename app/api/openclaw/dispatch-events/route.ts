import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, validateApiKey } from "@/lib/api-auth";
import { jsonError, sanitizeServerError } from "@/lib/api-route-helpers";

const ALLOWED_EVENTS = new Set([
  "dispatch.received",
  "dispatch.started",
  "dispatch.finished",
  "dispatch.failed",
  "dispatch.cancel_ack",
  "dispatch.cancel_result",
  "ticket.progress",
  "ticket.blocked",
  "ticket.failed",
  "ticket.finished",
] as const);
type AllowedDispatchEvent = (typeof ALLOWED_EVENTS extends Set<infer T> ? T : never);

type DispatchEventPayload = {
  workspaceId: string;
  event: string;
  ticketIds: string[];
  eventId?: string;
  dispatchId?: string;
  runId?: string;
  occurredAt?: number;
  message?: string;
  metadata?: unknown;
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const body = (await request.json()) as Partial<DispatchEventPayload>;
    if (!body || typeof body !== "object") {
      return jsonError("Invalid request body", 400);
    }

    if (typeof body.workspaceId !== "string" || body.workspaceId !== auth.workspaceId) {
      return jsonError("workspaceId does not match API key workspace", 403);
    }

    if (typeof body.event !== "string" || !ALLOWED_EVENTS.has(body.event as never)) {
      return jsonError("Unsupported dispatch event type", 400, { event: body.event ?? null });
    }
    const eventType = body.event as AllowedDispatchEvent;

    if (!isStringArray(body.ticketIds) || body.ticketIds.length === 0) {
      return jsonError("ticketIds must be a non-empty array of ticket ids", 400);
    }

    if (body.message !== undefined && typeof body.message !== "string") {
      return jsonError("message must be a string", 400);
    }

    if (body.occurredAt !== undefined && typeof body.occurredAt !== "number") {
      return jsonError("occurredAt must be a number", 400);
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.openclawDispatchProtocol.ingestPluginEvent, {
      workspaceId: auth.workspaceId as Id<"workspaces">,
      ticketIds: body.ticketIds.map((id) => id as Id<"tickets">),
      eventType,
      ...(typeof body.eventId === "string" ? { eventId: body.eventId } : {}),
      ...(typeof body.dispatchId === "string" ? { dispatchId: body.dispatchId } : {}),
      ...(typeof body.runId === "string" ? { runId: body.runId } : {}),
      ...(typeof body.occurredAt === "number" ? { occurredAt: body.occurredAt } : {}),
      ...(typeof body.message === "string" ? { message: body.message } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      agentApiKeyId: auth.apiKeyId,
    });

    return Response.json({ success: true, result });
  } catch (error) {
    return jsonError(sanitizeServerError(error, "Failed to ingest dispatch event"), 500);
  }
}
