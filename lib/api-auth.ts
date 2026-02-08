import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AuthResult {
  workspaceId: Id<"workspaces">;
  keyName: string;
  apiKeyId: Id<"apiKeys">;
  keyRole: "admin" | "agent";
}

export interface AgentPrincipal {
  ownerId: string;
  ownerType: "agent";
  ownerDisplayName: string;
}

const AGENT_SESSION_ID_MAX_LENGTH = 128;
const AGENT_SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const INVALID_API_KEY_WINDOW_MS = 60_000;
const MAX_INVALID_API_KEY_ATTEMPTS = 30;

type InvalidAttemptEntry = {
  count: number;
  windowStart: number;
};

const invalidApiKeyAttempts = new Map<string, InvalidAttemptEntry>();

const getClientAddress = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
};

const trackInvalidApiKeyAttempt = (clientAddress: string) => {
  const now = Date.now();
  const existing = invalidApiKeyAttempts.get(clientAddress);

  if (!existing || now - existing.windowStart >= INVALID_API_KEY_WINDOW_MS) {
    invalidApiKeyAttempts.set(clientAddress, { count: 1, windowStart: now });
  } else {
    existing.count += 1;
    invalidApiKeyAttempts.set(clientAddress, existing);
  }

  // Keep memory bounded for long-lived server processes.
  if (invalidApiKeyAttempts.size > 2_000) {
    for (const [address, entry] of invalidApiKeyAttempts) {
      if (now - entry.windowStart >= INVALID_API_KEY_WINDOW_MS) {
        invalidApiKeyAttempts.delete(address);
      }
    }
  }
};

const clearInvalidApiKeyAttempts = (clientAddress: string) => {
  invalidApiKeyAttempts.delete(clientAddress);
};

const isApiKeyRateLimited = (clientAddress: string) => {
  const entry = invalidApiKeyAttempts.get(clientAddress);
  if (!entry) return false;
  if (Date.now() - entry.windowStart >= INVALID_API_KEY_WINDOW_MS) {
    invalidApiKeyAttempts.delete(clientAddress);
    return false;
  }
  return entry.count >= MAX_INVALID_API_KEY_ATTEMPTS;
};

export async function validateApiKey(
  request: Request
): Promise<AuthResult | Response> {
  const clientAddress = getClientAddress(request);
  if (isApiKeyRateLimited(clientAddress)) {
    return new Response(
      JSON.stringify({ error: "Too many invalid API key attempts" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = request.headers.get("X-API-Key");

  if (!apiKey) {
    trackInvalidApiKeyAttempt(clientAddress);
    return new Response(
      JSON.stringify({ error: "Missing X-API-Key header" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!apiKey.startsWith("sk_")) {
    trackInvalidApiKeyAttempt(clientAddress);
    return new Response(
      JSON.stringify({ error: "Invalid API key format" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const keyHash = await hashKey(apiKey);
  const apiKeyDoc = await convex.query(api.apiKeys.getByHash, { keyHash });

  if (!apiKeyDoc) {
    trackInvalidApiKeyAttempt(clientAddress);
    return new Response(
      JSON.stringify({ error: "Invalid API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  clearInvalidApiKeyAttempts(clientAddress);

  return {
    workspaceId: apiKeyDoc.workspaceId,
    keyName: apiKeyDoc.name,
    apiKeyId: apiKeyDoc._id,
    keyRole: apiKeyDoc.role ?? "admin",
  };
}

export function getConvexClient() {
  return convex;
}

export function resolveAgentPrincipal(
  request: Request,
  auth: AuthResult
): AgentPrincipal | Response {
  const rawSessionId = request.headers.get("X-Agent-Session-Id");
  const sessionId = rawSessionId?.trim();

  if (sessionId) {
    if (
      sessionId.length > AGENT_SESSION_ID_MAX_LENGTH ||
      !AGENT_SESSION_ID_PATTERN.test(sessionId)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid X-Agent-Session-Id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return {
      ownerId: `session:${sessionId}`,
      ownerType: "agent",
      ownerDisplayName: sessionId,
    };
  }

  return {
    ownerId: `apikey:${auth.apiKeyId}`,
    ownerType: "agent",
    ownerDisplayName: auth.keyName,
  };
}

export function requireAdminApiKey(auth: AuthResult): Response | null {
  if (auth.keyRole !== "admin") {
    return new Response(
      JSON.stringify({ error: "Admin API key required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}
