import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const convex = getConvexClient();

  const workspace = await convex.query(api.workspaces.get, {
    id: auth.workspaceId,
  });

  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  return Response.json({
    workspaceId: workspace._id,
    name: workspace.name,
    docs: workspace.docs || null,
  });
}
