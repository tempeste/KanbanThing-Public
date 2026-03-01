import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { serializeOracle } from "@/lib/api-serializers";
import {
  getOracleBySlugSafe,
  jsonError,
  sanitizeServerError,
} from "@/lib/api-route-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const { slug } = await params;
    const convex = getConvexClient();
    const oracle = await getOracleBySlugSafe(
      convex,
      auth.workspaceId,
      slug,
      auth.apiKeyId
    );

    if (!oracle) {
      return jsonError("Oracle not found", 404);
    }

    return Response.json({ oracle: serializeOracle(oracle) });
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const { slug } = await params;
    const convex = getConvexClient();
    const oracle = await getOracleBySlugSafe(
      convex,
      auth.workspaceId,
      slug,
      auth.apiKeyId
    );

    if (!oracle) {
      return jsonError("Oracle not found", 404);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonError("Invalid JSON body", 400);
    }

    const updateArgs: {
      id: typeof oracle._id;
      name?: string;
      description?: string;
      content?: string;
      actor: { type: "agent"; id: string; displayName: string };
      agentApiKeyId: typeof auth.apiKeyId;
    } = {
      id: oracle._id,
      actor: {
        type: "agent",
        id: auth.apiKeyId,
        displayName: auth.keyName,
      },
      agentApiKeyId: auth.apiKeyId,
    };

    if (typeof body.name === "string") updateArgs.name = body.name;
    if (typeof body.description === "string")
      updateArgs.description = body.description;
    if (typeof body.content === "string") updateArgs.content = body.content;

    try {
      await convex.mutation(api.oracles.update, updateArgs);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const uncaughtMatch = rawMessage.match(/Uncaught Error: (.+?)(?:\n|$)/);
      const message = uncaughtMatch ? uncaughtMatch[1] : rawMessage;
      if (
        message.includes("Name is required") ||
        message.includes("cannot exceed")
      ) {
        return jsonError(message, 400);
      }
      return jsonError(
        sanitizeServerError(error, "Failed to update oracle"),
        500
      );
    }

    // Re-fetch to return updated state
    const updated = await getOracleBySlugSafe(
      convex,
      auth.workspaceId,
      slug,
      auth.apiKeyId
    );
    if (!updated) {
      return jsonError("Oracle not found", 404);
    }

    return Response.json({ oracle: serializeOracle(updated) });
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const { slug } = await params;
    const convex = getConvexClient();
    const oracle = await getOracleBySlugSafe(
      convex,
      auth.workspaceId,
      slug,
      auth.apiKeyId
    );

    if (!oracle) {
      return jsonError("Oracle not found", 404);
    }

    await convex.mutation(api.oracles.remove, {
      id: oracle._id,
      agentApiKeyId: auth.apiKeyId,
    });

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}
