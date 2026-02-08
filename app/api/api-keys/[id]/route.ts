import { NextRequest } from "next/server";
import {
  getConvexClient,
  requireAdminApiKey,
  validateApiKey,
} from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  getApiKeySafe,
  isInvalidConvexIdError,
  jsonError,
  sanitizeServerError,
} from "@/lib/api-route-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;
    const adminGuard = requireAdminApiKey(auth);
    if (adminGuard) return adminGuard;

    const { id } = await params;
    const keyId = id as Id<"apiKeys">;
    if (keyId === auth.apiKeyId) {
      return jsonError("Cannot delete the API key used for this request", 400);
    }

    const convex = getConvexClient();
    const key = await getApiKeySafe(convex, id, auth.apiKeyId);

    if (!key || key.workspaceId !== auth.workspaceId) {
      return jsonError("API key not found", 404);
    }

    await convex.mutation(api.apiKeys.remove, {
      id: keyId,
      agentApiKeyId: auth.apiKeyId,
    });

    return Response.json({ success: true });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("API key not found", 404);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}
