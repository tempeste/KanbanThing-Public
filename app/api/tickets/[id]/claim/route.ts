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
    await convex.mutation(api.tickets.claim, {
      id: id as Id<"tickets">,
      ownerId: auth.keyName,
      ownerType: "agent",
    });

    const updatedTicket = await convex.query(api.tickets.get, {
      id: id as Id<"tickets">,
    });

    return Response.json({
      success: true,
      ticket: {
        id: updatedTicket!._id,
        title: updatedTicket!.title,
        description: updatedTicket!.description,
        number: updatedTicket!.number ?? null,
        parentId: updatedTicket!.parentId ?? null,
        order: updatedTicket!.order,
        archived: updatedTicket!.archived ?? false,
        status: updatedTicket!.status,
        ownerId: updatedTicket!.ownerId,
        ownerType: updatedTicket!.ownerType,
        childCount: updatedTicket!.childCount ?? 0,
        childDoneCount: updatedTicket!.childDoneCount ?? 0,
        hasChildren: (updatedTicket!.childCount ?? 0) > 0,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to claim issue" },
      { status: 500 }
    );
  }
}
