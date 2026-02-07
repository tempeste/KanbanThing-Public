import { NextRequest } from "next/server";
import {
  validateApiKey,
  getConvexClient,
  resolveAgentPrincipal,
} from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { serializeTicket } from "@/lib/api-serializers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;
  const principal = resolveAgentPrincipal(request, auth);
  if (principal instanceof Response) return principal;

  const { id } = await params;
  const convex = getConvexClient();

  const ticket = await convex.query(api.tickets.get, {
    id: id as Id<"tickets">,
    agentApiKeyId: auth.apiKeyId,
  });

  if (!ticket) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  if (ticket.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  if (ticket.status !== "unclaimed") {
    return Response.json(
      { error: "Issue is not available to claim", currentStatus: ticket.status },
      { status: 409 }
    );
  }

  try {
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

    const updatedTicket = await convex.query(api.tickets.get, {
      id: id as Id<"tickets">,
      agentApiKeyId: auth.apiKeyId,
    });

    return Response.json({
      success: true,
      ticket: serializeTicket(updatedTicket!),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to claim issue" },
      { status: 500 }
    );
  }
}
