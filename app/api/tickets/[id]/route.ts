import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
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

  if (!ticket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  return Response.json({
    id: ticket._id,
    title: ticket.title,
    description: ticket.description,
    docs: ticket.docs,
    status: ticket.status,
    ownerId: ticket.ownerId,
    ownerType: ticket.ownerType,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  });
}
