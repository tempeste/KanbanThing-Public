import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const convex = getConvexClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let tickets;
  if (status && ["unclaimed", "in_progress", "done"].includes(status)) {
    tickets = await convex.query(api.tickets.listByStatus, {
      workspaceId: auth.workspaceId,
      status: status as "unclaimed" | "in_progress" | "done",
    });
  } else {
    tickets = await convex.query(api.tickets.list, {
      workspaceId: auth.workspaceId,
    });
  }

  return Response.json({
    tickets: tickets.map((t) => ({
      id: t._id,
      title: t.title,
      description: t.description,
      status: t.status,
      ownerId: t.ownerId,
      ownerType: t.ownerType,
      hasDocs: !!t.docs,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}
