import { NextRequest } from "next/server";
import {
  validateApiKey,
  getConvexClient,
  resolveAgentPrincipal,
} from "@/lib/api-auth";
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
  const principal = resolveAgentPrincipal(request, auth);
  if (principal instanceof Response) return principal;

  const ticket = await convex.query(api.tickets.get, {
    id: id as Id<"tickets">,
    agentApiKeyId: auth.apiKeyId,
  });

  if (!ticket || ticket.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    ownerId?: unknown;
    ownerType?: unknown;
    ownerDisplayName?: unknown;
  };

  if (
    body.ownerType !== undefined &&
    (typeof body.ownerType !== "string" || body.ownerType !== "agent")
  ) {
    return Response.json({ error: "Invalid ownerType" }, { status: 400 });
  }

  if (body.ownerId !== undefined) {
    if (typeof body.ownerId !== "string" || body.ownerId.trim() === "") {
      return Response.json({ error: "Invalid ownerId" }, { status: 400 });
    }
    if (body.ownerId.trim() !== principal.ownerId) {
      return Response.json({ error: "ownerId must match server identity" }, { status: 400 });
    }
  }

  if (body.ownerDisplayName !== undefined) {
    if (
      typeof body.ownerDisplayName !== "string" ||
      body.ownerDisplayName.trim() === ""
    ) {
      return Response.json({ error: "Invalid ownerDisplayName" }, { status: 400 });
    }
    if (body.ownerDisplayName.trim() !== principal.ownerDisplayName) {
      return Response.json(
        { error: "ownerDisplayName must match server identity" },
        { status: 400 }
      );
    }
  }

  await convex.mutation(api.tickets.assign, {
    id: id as Id<"tickets">,
    ownerId: principal.ownerId,
    ownerType: principal.ownerType,
    ownerDisplayName: principal.ownerDisplayName,
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
