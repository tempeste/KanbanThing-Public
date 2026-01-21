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
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.status !== "unclaimed") {
    return Response.json(
      { error: "Ticket is not available to claim", currentStatus: ticket.status },
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
        docs: updatedTicket!.docs,
        docId: updatedTicket!.docId,
        status: updatedTicket!.status,
        ownerId: updatedTicket!.ownerId,
        ownerType: updatedTicket!.ownerType,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to claim ticket" },
      { status: 500 }
    );
  }
}
