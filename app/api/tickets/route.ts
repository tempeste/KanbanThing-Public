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
  TICKET_STATUS_VALUES,
} from "@/lib/api-route-helpers";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const convex = getConvexClient();
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status = statusParam?.trim() || null;
    if (status && !TICKET_STATUS_VALUES.includes(status as (typeof TICKET_STATUS_VALUES)[number])) {
      return jsonError("Invalid status", 400);
    }

    const parentParamRaw = searchParams.get("parentId");
    const parentParam = parentParamRaw?.trim() ?? null;
    const parentId =
      parentParam === null ||
      parentParam === "" ||
      parentParam === "root" ||
      parentParam === "null"
        ? null
        : parentParam;

    let tickets;
    if (parentParam !== null) {
      if (parentId !== null) {
        const parentTicket = await getTicketSafe(convex, parentId, auth.apiKeyId);
        if (!parentTicket || parentTicket.workspaceId !== auth.workspaceId) {
          return jsonError("Invalid parentId", 400);
        }
      }

      tickets = await convex.query(api.tickets.listByParent, {
        workspaceId: auth.workspaceId,
        parentId: parentId as Id<"tickets"> | null,
        agentApiKeyId: auth.apiKeyId,
      });
      if (status) {
        tickets = tickets.filter((ticket) => ticket.status === status);
      }
    } else if (status) {
      tickets = await convex.query(api.tickets.listByStatus, {
        workspaceId: auth.workspaceId,
        status: status as "unclaimed" | "in_progress" | "done",
        agentApiKeyId: auth.apiKeyId,
      });
    } else {
      tickets = await convex.query(api.tickets.list, {
        workspaceId: auth.workspaceId,
        agentApiKeyId: auth.apiKeyId,
      });
    }

    return Response.json({
      tickets: tickets.map(serializeTicket),
    });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Invalid ticket id", 400);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.title !== "string" || !body.title.trim()) {
      return jsonError("Title is required", 400);
    }

    const title = body.title.trim();
    const description = typeof body.description === "string" ? body.description : "";
    const parentIdRaw = body.parentId;
    const parentId =
      parentIdRaw === undefined || parentIdRaw === null || parentIdRaw === ""
        ? null
        : String(parentIdRaw).trim();

    const convex = getConvexClient();
    if (parentId !== null) {
      const parentTicket = await getTicketSafe(convex, parentId, auth.apiKeyId);
      if (!parentTicket || parentTicket.workspaceId !== auth.workspaceId) {
        return jsonError("Invalid parentId", 400);
      }
    }

    let id: Id<"tickets">;
    try {
      id = await convex.mutation(api.tickets.create, {
        workspaceId: auth.workspaceId,
        title,
        description,
        parentId: parentId as Id<"tickets"> | null,
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
      return jsonError(sanitizeServerError(error, "Failed to create ticket"), 500);
    }

    const ticket = await convex.query(api.tickets.get, {
      id,
      agentApiKeyId: auth.apiKeyId,
    });
    if (!ticket) {
      return jsonError("Ticket not found", 404);
    }

    return Response.json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Invalid parentId", 400);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}
