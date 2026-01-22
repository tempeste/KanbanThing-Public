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

  const doc = await convex.query(api.featureDocs.get, {
    id: id as Id<"featureDocs">,
  });

  if (!doc) {
    return Response.json({ error: "Doc not found" }, { status: 404 });
  }

  if (doc.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Doc not found" }, { status: 404 });
  }

  return Response.json({
    id: doc._id,
    title: doc.title,
    content: doc.content,
    number: doc.number ?? null,
    status: doc.status ?? "unclaimed",
    order: doc.order ?? doc.createdAt,
    parentDocId: doc.parentDocId ?? null,
    archived: doc.archived ?? false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const convex = getConvexClient();

  const doc = await convex.query(api.featureDocs.get, {
    id: id as Id<"featureDocs">,
  });

  if (!doc || doc.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Doc not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : undefined;
  const content =
    typeof body?.content === "string" ? body.content.trim() : undefined;
  const parentDocId =
    typeof body?.parentDocId === "string"
      ? body.parentDocId
      : body?.parentDocId === null
      ? null
      : undefined;
  const status =
    typeof body?.status === "string" &&
    ["unclaimed", "in_progress", "done"].includes(body.status)
      ? (body.status as "unclaimed" | "in_progress" | "done")
      : undefined;
  const order = typeof body?.order === "number" ? body.order : undefined;
  const archived = typeof body?.archived === "boolean" ? body.archived : undefined;

  if (
    title === undefined &&
    content === undefined &&
    parentDocId === undefined &&
    status === undefined &&
    order === undefined &&
    archived === undefined
  ) {
    return Response.json(
      { error: "At least one field is required" },
      { status: 400 }
    );
  }

  if (archived !== undefined) {
    await convex.mutation(api.featureDocs.setArchived, {
      id: doc._id,
      archived,
    });
  }

  if (
    title !== undefined ||
    content !== undefined ||
    parentDocId !== undefined ||
    status !== undefined ||
    order !== undefined
  ) {
    await convex.mutation(api.featureDocs.update, {
      id: doc._id,
      title,
      content,
      parentDocId,
      status,
      order,
    });
  }

  return Response.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const convex = getConvexClient();

  const doc = await convex.query(api.featureDocs.get, {
    id: id as Id<"featureDocs">,
  });

  if (!doc || doc.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "Doc not found" }, { status: 404 });
  }

  await convex.mutation(api.featureDocs.remove, { id: doc._id });

  return Response.json({ success: true });
}
