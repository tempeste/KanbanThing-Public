import { NextRequest } from "next/server";
import {
  validateApiKey,
  getConvexClient,
  resolveAgentPrincipal,
} from "@/lib/api-auth";
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
    const principal = resolveAgentPrincipal(request, auth);
    if (principal instanceof Response) return principal;

    const { id } = await params;
    const convex = getConvexClient();

    const ticket = await getTicketSafe(convex, id, auth.apiKeyId);

    if (!ticket || ticket.workspaceId !== auth.workspaceId) {
      return jsonError("Issue not found", 404);
    }

    if (ticket.status !== "unclaimed") {
      return jsonError("Issue is not available to claim", 409, {
        currentStatus: ticket.status,
      });
    }

    await convex.mutation(api.tickets.assign, {
      id: id as Id<"tickets">,
      ownerId: principal.ownerId,
      ownerType: principal.ownerType,
      ownerDisplayName: principal.ownerDisplayName,
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
    return jsonError(sanitizeServerError(error, "Failed to claim issue"), 500);
  }
}
