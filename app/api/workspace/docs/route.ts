import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const convex = getConvexClient();

  const workspace = await convex.query(api.workspaces.get, {
    id: auth.workspaceId,
    agentApiKeyId: auth.apiKeyId,
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

export async function PATCH(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.docs !== "string") {
    return Response.json({ error: "Invalid docs" }, { status: 400 });
  }

  const convex = getConvexClient();

  await convex.mutation(api.workspaces.update, {
    id: auth.workspaceId,
    docs: body.docs,
    actor: {
      type: "agent",
      id: auth.apiKeyId,
      displayName: auth.keyName,
    },
    agentApiKeyId: auth.apiKeyId,
  });

  const workspace = await convex.query(api.workspaces.get, {
    id: auth.workspaceId,
    agentApiKeyId: auth.apiKeyId,
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
