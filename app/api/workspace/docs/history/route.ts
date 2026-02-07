import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const convex = getConvexClient();
  const versions = await convex.query(api.workspaces.listDocsVersions, {
    workspaceId: auth.workspaceId,
    limit: Number.isFinite(limit) ? limit : undefined,
    agentApiKeyId: auth.apiKeyId,
  });

  return Response.json({
    versions: versions.map((version) => ({
      id: version._id,
      workspaceId: version.workspaceId,
      docs: version.docs,
      actorType: version.actorType,
      actorId: version.actorId,
      actorDisplayName: version.actorDisplayName ?? null,
      createdAt: version.createdAt,
    })),
  });
}
