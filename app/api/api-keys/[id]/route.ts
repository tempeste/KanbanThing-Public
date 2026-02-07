import { NextRequest } from "next/server";
import {
  getConvexClient,
  requireAdminApiKey,
  validateApiKey,
} from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;
  const adminGuard = requireAdminApiKey(auth);
  if (adminGuard) return adminGuard;

  const { id } = await params;
  const keyId = id as Id<"apiKeys">;
  if (keyId === auth.apiKeyId) {
    return Response.json(
      { error: "Cannot delete the API key used for this request" },
      { status: 400 }
    );
  }

  const convex = getConvexClient();
  const key = await convex.query(api.apiKeys.get, {
    id: keyId,
    agentApiKeyId: auth.apiKeyId,
  });

  if (!key || key.workspaceId !== auth.workspaceId) {
    return Response.json({ error: "API key not found" }, { status: 404 });
  }

  await convex.mutation(api.apiKeys.remove, {
    id: keyId,
    agentApiKeyId: auth.apiKeyId,
  });

  return Response.json({ success: true });
}
