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

    if (ticket.status !== "in_progress") {
      return jsonError("Issue must be in progress to complete", 409, {
        currentStatus: ticket.status,
      });
    }

    await convex.mutation(api.tickets.complete, {
      id: id as Id<"tickets">,
      actor: {
        type: "agent",
        id: auth.apiKeyId,
        displayName: auth.keyName,
      },
      agentApiKeyId: auth.apiKeyId,
    });

    const updatedTicket = await getTicketSafe(convex, id, auth.apiKeyId);
    if (!updatedTicket) {
      return jsonError("Issue not found", 404);
    }

    return Response.json({
      success: true,
      ticket: serializeTicket(updatedTicket),
    });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Issue not found", 404);
    }
    return jsonError(sanitizeServerError(error, "Failed to complete issue"), 500);
  }
}
