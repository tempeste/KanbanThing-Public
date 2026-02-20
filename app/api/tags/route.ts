import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { jsonError, sanitizeServerError } from "@/lib/api-route-helpers";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const convex = getConvexClient();
    const tags = await convex.query(api.tags.list, {
      workspaceId: auth.workspaceId,
      agentApiKeyId: auth.apiKeyId,
    });

    return Response.json({
      tags: tags.map((t) => ({
        id: t._id,
        name: t.name,
        color: t.color,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" || !body.name.trim()) {
      return jsonError("Tag name is required", 400);
    }
    if (typeof body.color !== "string" || !body.color.trim()) {
      return jsonError("Tag color is required", 400);
    }

    const convex = getConvexClient();
    try {
      const id = await convex.mutation(api.tags.create, {
        workspaceId: auth.workspaceId,
        name: body.name.trim(),
        color: body.color.trim(),
        agentApiKeyId: auth.apiKeyId,
      });

      const tags = await convex.query(api.tags.list, {
        workspaceId: auth.workspaceId,
        agentApiKeyId: auth.apiKeyId,
      });
      const tag = tags.find((t) => t._id === id);

      return Response.json({
        tag: tag
          ? { id: tag._id, name: tag.name, color: tag.color, createdAt: tag.createdAt }
          : { id },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("already exists") ||
        message.includes("Tag name is required") ||
        message.includes("cannot exceed") ||
        message.includes("Cannot create more")
      ) {
        return jsonError(message, 400);
      }
      return jsonError(sanitizeServerError(error, "Failed to create tag"), 500);
    }
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}
