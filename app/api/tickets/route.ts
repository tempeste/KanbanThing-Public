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
    });
    if (status && ["unclaimed", "in_progress", "done"].includes(status)) {
      tickets = tickets.filter((ticket) => ticket.status === status);
    }
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
      ownerDisplayName: t.ownerDisplayName,
      parentId: t.parentId ?? null,
      order: t.order,
      archived: t.archived ?? false,
      childCount: t.childCount ?? 0,
      childDoneCount: t.childDoneCount ?? 0,
      hasChildren: (t.childCount ?? 0) > 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}
