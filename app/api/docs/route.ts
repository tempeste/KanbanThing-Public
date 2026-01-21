import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const convex = getConvexClient();

  const docs = await convex.query(api.featureDocs.list, {
    workspaceId: auth.workspaceId,
  });

  return Response.json({
    docs: docs.map((doc) => ({
      id: doc._id,
      title: doc.title,
      preview: doc.content.slice(0, 160),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!title) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  const convex = getConvexClient();
  const id = await convex.mutation(api.featureDocs.create, {
    workspaceId: auth.workspaceId,
    title,
    content,
  });

  return Response.json({ success: true, id });
}
