import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  isInvalidConvexIdError,
  jsonError,
  sanitizeServerError,
} from "@/lib/api-route-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Request body is required", 400);

    const convex = getConvexClient();
    try {
      await convex.mutation(api.tags.update, {
        id: id as Id<"workspaceTags">,
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.color === "string" ? { color: body.color } : {}),
        agentApiKeyId: auth.apiKeyId,
      });
      return Response.json({ success: true });
    } catch (error) {
      if (isInvalidConvexIdError(error)) {
        return jsonError("Tag not found", 404);
      }
      const message = error instanceof Error ? error.message : "";
      if (message.includes("not found")) return jsonError("Tag not found", 404);
      if (message.includes("already exists") || message.includes("Tag name is required")) {
        return jsonError(message, 400);
      }
      return jsonError(sanitizeServerError(error, "Failed to update tag"), 500);
    }
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const { id } = await params;
    const convex = getConvexClient();
    try {
      await convex.mutation(api.tags.remove, {
        id: id as Id<"workspaceTags">,
        agentApiKeyId: auth.apiKeyId,
      });
      return Response.json({ success: true });
    } catch (error) {
      if (isInvalidConvexIdError(error)) {
        return jsonError("Tag not found", 404);
      }
      return jsonError(sanitizeServerError(error, "Failed to delete tag"), 500);
    }
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}
