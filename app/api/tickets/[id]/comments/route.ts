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
    agentApiKeyId: auth.apiKeyId,
  });

  if (!ticket || ticket.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const comments = await convex.query(api.ticketComments.listByTicket, {
    ticketId: id as Id<"tickets">,
    limit: Number.isFinite(limit) ? limit : undefined,
    agentApiKeyId: auth.apiKeyId,
  });

  return Response.json({
    comments: comments.map((comment) => ({
      id: comment._id,
      ticketId: comment.ticketId,
      body: comment.body,
      authorType: comment.authorType,
      authorId: comment.authorId,
      authorDisplayName: comment.authorDisplayName ?? null,
      createdAt: comment.createdAt,
    })),
  });
}

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
  if (!body || typeof body.body !== "string" || !body.body.trim()) {
    return Response.json({ error: "Comment body is required" }, { status: 400 });
  }

  const commentId = await convex.mutation(api.ticketComments.add, {
    ticketId: id as Id<"tickets">,
    body: body.body.trim(),
    actor: {
      type: "agent",
      id: auth.apiKeyId,
      displayName: auth.keyName,
    },
    agentApiKeyId: auth.apiKeyId,
  });

  const created = await convex.query(api.ticketComments.get, {
    id: commentId,
    agentApiKeyId: auth.apiKeyId,
  });

  if (!created) {
    return Response.json({ error: "Comment not found" }, { status: 404 });
  }

  return Response.json({
    comment: {
      id: created._id,
      ticketId: created.ticketId,
      body: created.body,
      authorType: created.authorType,
      authorId: created.authorId,
      authorDisplayName: created.authorDisplayName ?? null,
      createdAt: created.createdAt,
    },
  });
}
