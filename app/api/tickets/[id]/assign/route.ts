import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { serializeTicket } from "@/lib/api-serializers";

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
  if (!body || typeof body.ownerId !== "string" || body.ownerId.trim() === "") {
    return Response.json({ error: "Invalid ownerId" }, { status: 400 });
  }
  if (body.ownerType !== "user" && body.ownerType !== "agent") {
    return Response.json({ error: "Invalid ownerType" }, { status: 400 });
  }

  const ownerDisplayName =
    body.ownerDisplayName && typeof body.ownerDisplayName === "string"
      ? body.ownerDisplayName
      : undefined;

  await convex.mutation(api.tickets.assign, {
    id: id as Id<"tickets">,
    ownerId: body.ownerId,
    ownerType: body.ownerType,
    ownerDisplayName,
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
