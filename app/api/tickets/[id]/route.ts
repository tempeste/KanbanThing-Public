import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { serializeTicket } from "@/lib/api-serializers";
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

    return Response.json(serializeTicket(ticket));
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Issue not found", 404);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}

export async function PATCH(
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError("Invalid body", 400);
    }

    const updates: {
      title?: string;
      description?: string;
      parentId?: Id<"tickets"> | null;
      archived?: boolean;
      order?: number;
    } = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return jsonError("Invalid title", 400);
      }
      updates.title = body.title.trim();
    }

    if (body.description !== undefined) {
      if (typeof body.description !== "string") {
        return jsonError("Invalid description", 400);
      }
      updates.description = body.description;
    }

    if (body.parentId !== undefined) {
      if (body.parentId === null || body.parentId === "") {
        updates.parentId = null;
      } else if (typeof body.parentId === "string") {
        updates.parentId = body.parentId as Id<"tickets">;
      } else {
        return jsonError("Invalid parentId", 400);
      }
    }

    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") {
        return jsonError("Invalid archived flag", 400);
      }
      updates.archived = body.archived;
    }

    if (body.order !== undefined) {
      if (typeof body.order !== "number" || Number.isNaN(body.order)) {
        return jsonError("Invalid order", 400);
      }
      updates.order = body.order;
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("No valid fields to update", 400);
    }

    try {
      await convex.mutation(api.tickets.update, {
        id: id as Id<"tickets">,
        ...updates,
        actor: {
          type: "agent",
          id: auth.apiKeyId,
          displayName: auth.keyName,
        },
        agentApiKeyId: auth.apiKeyId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Invalid parent ticket") || isInvalidConvexIdError(error)) {
        return jsonError("Invalid parentId", 400);
      }
      if (message.includes("Ticket not found")) {
        return jsonError("Issue not found", 404);
      }
      return jsonError(sanitizeServerError(error, "Failed to update issue"), 500);
    }

    const updated = await getTicketSafe(convex, id, auth.apiKeyId);

    if (!updated) {
      return jsonError("Issue not found", 404);
    }

    return Response.json({ ticket: serializeTicket(updated) });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Issue not found", 404);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}

export async function DELETE(
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

    await convex.mutation(api.tickets.remove, {
      id: id as Id<"tickets">,
      actor: {
        type: "agent",
        id: auth.apiKeyId,
        displayName: auth.keyName,
      },
      agentApiKeyId: auth.apiKeyId,
    });

    return Response.json({ success: true });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Issue not found", 404);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}
