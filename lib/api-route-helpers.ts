import type { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";

const INVALID_ID_ERROR_PATTERNS = [
  "ArgumentValidationError",
  "Expected type `id`",
  "Expected type `Id`",
  "Invalid argument",
  "invalid id",
  "is not a valid",
] as const;

const LEAKY_ERROR_PATTERNS = ["Request ID", "convex/", "[Request ID:"] as const;

export const TICKET_STATUS_VALUES = ["unclaimed", "in_progress", "done"] as const;

export const jsonError = (
  error: string,
  status: number,
  extra?: Record<string, unknown>
) => Response.json({ error, ...extra }, { status });

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "";

export const isInvalidConvexIdError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return INVALID_ID_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern.toLowerCase())
  );
};

export const sanitizeServerError = (
  error: unknown,
  fallback = "Internal server error"
) => {
  const message = getErrorMessage(error);
  if (!message) return fallback;

  const lower = message.toLowerCase();
  if (LEAKY_ERROR_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()))) {
    return fallback;
  }

  return fallback;
};

export const getTicketSafe = async (
  convex: ConvexHttpClient,
  id: string,
  agentApiKeyId: Id<"apiKeys">
): Promise<Doc<"tickets"> | null> => {
  try {
    return await convex.query(api.tickets.get, {
      id: id as Id<"tickets">,
      agentApiKeyId,
    });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return null;
    }
    throw error;
  }
};

export const getApiKeySafe = async (
  convex: ConvexHttpClient,
  id: string,
  agentApiKeyId: Id<"apiKeys">
): Promise<Doc<"apiKeys"> | null> => {
  try {
    return await convex.query(api.apiKeys.get, {
      id: id as Id<"apiKeys">,
      agentApiKeyId,
    });
  } catch (error) {
    if (isInvalidConvexIdError(error)) {
      return null;
    }
    throw error;
  }
};
