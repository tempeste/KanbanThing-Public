import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { serializeTicket } from "@/lib/api-serializers";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const convex = getConvexClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const parentParamRaw = searchParams.get("parentId");
  const parentParam = parentParamRaw?.trim() ?? null;
  const parentId =
    parentParam === null || parentParam === "" || parentParam === "root" || parentParam === "null"
      ? null
      : parentParam;

  let tickets;
  if (parentParam !== null) {
    tickets = await convex.query(api.tickets.listByParent, {
      workspaceId: auth.workspaceId,
      parentId: parentId as Id<"tickets"> | null,
      agentApiKeyId: auth.apiKeyId,
    });
    if (status && ["unclaimed", "in_progress", "done"].includes(status)) {
      tickets = tickets.filter((ticket) => ticket.status === status);
    }
  } else if (status && ["unclaimed", "in_progress", "done"].includes(status)) {
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
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  const title = body.title.trim();
  const description = typeof body.description === "string" ? body.description : "";
  const parentIdRaw = body.parentId;
  const parentId =
    parentIdRaw === undefined || parentIdRaw === null || parentIdRaw === ""
      ? null
      : String(parentIdRaw);

  const convex = getConvexClient();
  const id = await convex.mutation(api.tickets.create, {
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

  const ticket = await convex.query(api.tickets.get, {
    id,
    agentApiKeyId: auth.apiKeyId,
  });
  if (!ticket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }

  return Response.json({ ticket: serializeTicket(ticket) });
}
