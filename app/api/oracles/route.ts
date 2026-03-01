import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { serializeOracle, serializeOracleSummary } from "@/lib/api-serializers";
import {
  jsonError,
  sanitizeServerError,
} from "@/lib/api-route-helpers";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const convex = getConvexClient();
    const oracles = await convex.query(api.oracles.list, {
      workspaceId: auth.workspaceId,
      agentApiKeyId: auth.apiKeyId,
    });

    return Response.json({
      oracles: oracles.map(serializeOracleSummary),
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
    if (!body) {
      return jsonError("Invalid JSON body", 400);
    }

    if (typeof body.slug !== "string" || !body.slug.trim()) {
      return jsonError("slug is required", 400);
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      return jsonError("name is required", 400);
    }
    if (typeof body.description !== "string") {
      return jsonError("description is required", 400);
    }
    if (typeof body.content !== "string") {
      return jsonError("content is required", 400);
    }

    const convex = getConvexClient();
    let id;
    try {
      id = await convex.mutation(api.oracles.create, {
        workspaceId: auth.workspaceId,
        slug: body.slug,
        name: body.name,
        description: body.description,
        content: body.content,
        actor: {
          type: "agent",
          id: auth.apiKeyId,
          displayName: auth.keyName,
        },
        agentApiKeyId: auth.apiKeyId,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      // Extract clean error from Convex wrapper (format: "...\nUncaught Error: <message>\n...")
      const uncaughtMatch = rawMessage.match(/Uncaught Error: (.+?)(?:\n|$)/);
      const message = uncaughtMatch ? uncaughtMatch[1] : rawMessage;
      if (
        message.includes("already exists") ||
        message.includes("reserved") ||
        message.includes("Slug must") ||
        message.includes("Name is required") ||
        message.includes("cannot exceed") ||
        message.includes("only lowercase")
      ) {
        return jsonError(message, 400);
      }
      return jsonError(sanitizeServerError(error, "Failed to create oracle"), 500);
    }

    const oracle = await convex.query(api.oracles.get, {
      id,
      agentApiKeyId: auth.apiKeyId,
    });
    if (!oracle) {
      return jsonError("Oracle not found after creation", 500);
    }

    return Response.json({ oracle: serializeOracle(oracle) }, { status: 201 });
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}
