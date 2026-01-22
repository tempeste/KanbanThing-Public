import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const convex = getConvexClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const docId = searchParams.get("docId");

  let tickets;
  if (docId) {
    tickets = await convex.query(api.tickets.listByDoc, {
      workspaceId: auth.workspaceId,
      docId: docId as Id<"featureDocs">,
      status:
        status && ["unclaimed", "in_progress", "done"].includes(status)
          ? (status as "unclaimed" | "in_progress" | "done")
          : undefined,
    });
  } else if (status && ["unclaimed", "in_progress", "done"].includes(status)) {
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
      number: t.number ?? null,
      status: t.status,
      ownerId: t.ownerId,
      ownerType: t.ownerType,
      docId: t.docId,
      parentTicketId: t.parentTicketId ?? null,
      order: t.order,
      archived: t.archived ?? false,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}
