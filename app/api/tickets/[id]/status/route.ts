import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { serializeTicket } from "@/lib/api-serializers";
import {
  getTicketSafe,
  isInvalidConvexIdError,
  jsonError,
  sanitizeServerError,
  TICKET_STATUS_VALUES,
} from "@/lib/api-route-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const { id } = await params;
    const convex = getConvexClient();

    const ticket = await getTicketSafe(convex, id, auth.apiKeyId);

    if (!ticket || ticket.workspaceId !== auth.workspaceId) {
      return jsonError("Issue not found", 404);
    }

    const body = await request.json().catch(() => null);
    if (!body || !TICKET_STATUS_VALUES.includes(body.status)) {
      return jsonError("Invalid status", 400);
    }

    const order = body.order;
    if (order !== undefined && (typeof order !== "number" || Number.isNaN(order))) {
      return jsonError("Invalid order", 400);
    }
    const reason =
      body.reason === undefined
        ? undefined
        : typeof body.reason === "string"
          ? body.reason.trim()
          : null;
    if (reason === null || reason === "") {
      return jsonError("Invalid reason", 400);
    }

    try {
      if (typeof order === "number") {
        await convex.mutation(api.tickets.move, {
          id: id as Id<"tickets">,
          status: body.status,
          order,
          reason,
          actor: {
            type: "agent",
            id: auth.apiKeyId,
            displayName: auth.keyName,
          },
          agentApiKeyId: auth.apiKeyId,
        });
      } else {
        await convex.mutation(api.tickets.updateStatus, {
          id: id as Id<"tickets">,
          status: body.status,
          reason,
          actor: {
            type: "agent",
            id: auth.apiKeyId,
            displayName: auth.keyName,
          },
          agentApiKeyId: auth.apiKeyId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Reason is required")) {
        return jsonError("Reason is required for this transition", 400);
      }
      if (message.includes("Transition not allowed")) {
        return jsonError("Transition not allowed", 409);
      }
      if (message.includes("Ticket not found") || isInvalidConvexIdError(error)) {
        return jsonError("Issue not found", 404);
      }
      return jsonError(sanitizeServerError(error, "Failed to update issue status"), 500);
    }

    const updated = await getTicketSafe(convex, id, auth.apiKeyId);

    if (!updated) {
      return jsonError("Issue not found", 404);
    }

    return Response.json({ ticket: serializeTicket(updated) });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Issue not found", 404);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}
