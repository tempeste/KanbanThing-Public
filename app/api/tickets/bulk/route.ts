import { NextRequest } from "next/server";
import {
  validateApiKey,
  getConvexClient,
  requireAdminApiKey,
} from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  isInvalidConvexIdError,
  jsonError,
  sanitizeServerError,
} from "@/lib/api-route-helpers";

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError("Invalid body", 400);
    }

    const { action, ids } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonError("ids must be a non-empty array", 400);
    }
    if (ids.length > 100) {
      return jsonError("Cannot process more than 100 tickets at once", 400);
    }
    if (!ids.every((id: unknown) => typeof id === "string")) {
      return jsonError("All ids must be strings", 400);
    }

    const convex = getConvexClient();
    const actor = {
      type: "agent" as const,
      id: auth.apiKeyId,
      displayName: auth.keyName,
    };

    switch (action) {
      case "archive": {
        await convex.mutation(api.tickets.bulkArchive, {
          ids: ids as Id<"tickets">[],
          archived: true,
          actor,
          agentApiKeyId: auth.apiKeyId,
        });
        return Response.json({ success: true, action: "archive", count: ids.length });
      }
      case "unarchive": {
        await convex.mutation(api.tickets.bulkArchive, {
          ids: ids as Id<"tickets">[],
          archived: false,
          actor,
          agentApiKeyId: auth.apiKeyId,
        });
        return Response.json({ success: true, action: "unarchive", count: ids.length });
      }
      case "delete": {
        const adminGuard = requireAdminApiKey(auth);
        if (adminGuard) return adminGuard;
        await convex.mutation(api.tickets.bulkDelete, {
          ids: ids as Id<"tickets">[],
          actor,
          agentApiKeyId: auth.apiKeyId,
        });
        return Response.json({ success: true, action: "delete", count: ids.length });
      }
      default:
        return jsonError(
          'Invalid action. Must be "archive", "unarchive", or "delete"',
          400
        );
    }
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return jsonError("Invalid ticket id in array", 400);
    }
    return jsonError(sanitizeServerError(error), 500);
  }
}
