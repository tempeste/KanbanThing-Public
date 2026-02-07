import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { serializeTicket } from "@/lib/api-serializers";

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
    agentApiKeyId: auth.apiKeyId,
  });

  if (!ticket) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  if (ticket.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  return Response.json(serializeTicket(ticket));
}

export async function PATCH(
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
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
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
      return Response.json({ error: "Invalid title" }, { status: 400 });
    }
    updates.title = body.title.trim();
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      return Response.json({ error: "Invalid description" }, { status: 400 });
    }
    updates.description = body.description;
  }

  if (body.parentId !== undefined) {
    if (body.parentId === null || body.parentId === "") {
      updates.parentId = null;
    } else if (typeof body.parentId === "string") {
      updates.parentId = body.parentId as Id<"tickets">;
    } else {
      return Response.json({ error: "Invalid parentId" }, { status: 400 });
    }
  }

  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") {
      return Response.json({ error: "Invalid archived flag" }, { status: 400 });
    }
    updates.archived = body.archived;
  }

  if (body.order !== undefined) {
    if (typeof body.order !== "number" || Number.isNaN(body.order)) {
      return Response.json({ error: "Invalid order" }, { status: 400 });
    }
    updates.order = body.order;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

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

  const updated = await convex.query(api.tickets.get, {
    id: id as Id<"tickets">,
    agentApiKeyId: auth.apiKeyId,
  });

  if (!updated) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  return Response.json({ ticket: serializeTicket(updated) });
}

export async function DELETE(
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
}
