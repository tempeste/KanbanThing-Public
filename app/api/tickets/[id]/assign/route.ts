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

    const { id } = await params;
    const convex = getConvexClient();
    const principal = resolveAgentPrincipal(request, auth);
    if (principal instanceof Response) return principal;

    const ticket = await getTicketSafe(convex, id, auth.apiKeyId);

    if (!ticket || ticket.workspaceId !== auth.workspaceId) {
      return jsonError("Issue not found", 404);
    }

    const body = (await request.json().catch(() => ({}))) as {
      ownerId?: unknown;
      ownerType?: unknown;
      ownerDisplayName?: unknown;
    };

    if (
      body.ownerType !== undefined &&
      (typeof body.ownerType !== "string" || body.ownerType !== "agent")
    ) {
      return jsonError("Invalid ownerType", 400);
    }

    if (body.ownerId !== undefined) {
      if (typeof body.ownerId !== "string" || body.ownerId.trim() === "") {
        return jsonError("Invalid ownerId", 400);
      }
      if (body.ownerId.trim() !== principal.ownerId) {
        return jsonError("ownerId must match server identity", 400);
      }
    }

    if (body.ownerDisplayName !== undefined) {
      if (
        typeof body.ownerDisplayName !== "string" ||
        body.ownerDisplayName.trim() === ""
      ) {
        return jsonError("Invalid ownerDisplayName", 400);
      }
      if (body.ownerDisplayName.trim() !== principal.ownerDisplayName) {
        return jsonError("ownerDisplayName must match server identity", 400);
      }
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

    const updated = await getTicketSafe(convex, id, auth.apiKeyId);

    if (!updated) {
      return jsonError("Issue not found", 404);
    }

    return Response.json({ ticket: serializeTicket(updated) });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Issue not found", 404);
    }
    return jsonError(sanitizeServerError(error, "Failed to assign issue"), 500);
  }
}
