import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { serializeTicket } from "@/lib/api-serializers";

const STATUS_VALUES = ["unclaimed", "in_progress", "done"] as const;

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

  if (!ticket || ticket.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !STATUS_VALUES.includes(body.status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const order = body.order;
  if (order !== undefined && (typeof order !== "number" || Number.isNaN(order))) {
    return Response.json({ error: "Invalid order" }, { status: 400 });
  }
  const reason =
    body.reason === undefined
      ? undefined
      : typeof body.reason === "string"
        ? body.reason.trim()
        : null;
  if (reason === null || reason === "") {
    return Response.json({ error: "Invalid reason" }, { status: 400 });
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
    const message = error instanceof Error ? error.message : "Failed to update issue status";
    if (message.includes("Reason is required")) {
      return Response.json({ error: message }, { status: 400 });
    }
    if (message.includes("Transition not allowed")) {
      return Response.json({ error: message }, { status: 409 });
    }
    return Response.json({ error: message }, { status: 500 });
  }

  const updated = await convex.query(api.tickets.get, {
    id: id as Id<"tickets">,
    agentApiKeyId: auth.apiKeyId,
  });

  if (!updated) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  return Response.json({ ticket: serializeTicket(updated) });
}
