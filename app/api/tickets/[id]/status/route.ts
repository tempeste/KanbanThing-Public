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

  if (typeof order === "number") {
    await convex.mutation(api.tickets.move, {
      id: id as Id<"tickets">,
      status: body.status,
      order,
      actor: {
        type: "agent",
        id: auth.apiKeyId,
        displayName: auth.keyName,
      },
    });
  } else {
    await convex.mutation(api.tickets.updateStatus, {
      id: id as Id<"tickets">,
      status: body.status,
      actor: {
        type: "agent",
        id: auth.apiKeyId,
        displayName: auth.keyName,
      },
    });
  }

  const updated = await convex.query(api.tickets.get, {
    id: id as Id<"tickets">,
  });

  if (!updated) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  return Response.json({ ticket: serializeTicket(updated) });
}
