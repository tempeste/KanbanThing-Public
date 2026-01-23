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
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  if (ticket.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  return Response.json({
    id: ticket._id,
    title: ticket.title,
    description: ticket.description,
    number: ticket.number ?? null,
    parentId: ticket.parentId ?? null,
    order: ticket.order,
    archived: ticket.archived ?? false,
    status: ticket.status,
    ownerId: ticket.ownerId,
    ownerType: ticket.ownerType,
    childCount: ticket.childCount ?? 0,
    childDoneCount: ticket.childDoneCount ?? 0,
    hasChildren: (ticket.childCount ?? 0) > 0,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  });
}
