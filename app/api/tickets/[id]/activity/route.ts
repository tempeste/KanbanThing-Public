import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  getTicketSafe,
  isInvalidConvexIdError,
  jsonError,
  sanitizeServerError,
} from "@/lib/api-route-helpers";

export async function GET(
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

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const events = await convex.query(api.ticketActivities.listByTicket, {
      ticketId: id as Id<"tickets">,
      limit: Number.isFinite(limit) ? limit : undefined,
      agentApiKeyId: auth.apiKeyId,
    });

    return Response.json({
      events: events.map((event) => ({
        id: event._id,
        ticketId: event.ticketId,
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId,
        actorDisplayName: event.actorDisplayName ?? null,
        data: event.data ?? null,
        createdAt: event.createdAt,
      })),
    });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Issue not found", 404);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}
