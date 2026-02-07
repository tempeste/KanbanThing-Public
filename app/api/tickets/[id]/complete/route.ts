import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

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

  if (ticket.status !== "in_progress") {
    return Response.json(
      { error: "Issue must be in progress to complete", currentStatus: ticket.status },
      { status: 409 }
    );
  }

  try {
    await convex.mutation(api.tickets.complete, {
      id: id as Id<"tickets">,
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
      ticket: {
        id: updatedTicket!._id,
        title: updatedTicket!.title,
        status: updatedTicket!.status,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to complete issue" },
      { status: 500 }
    );
  }
}
