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

export async function validateApiKey(
  request: Request
): Promise<AuthResult | Response> {
  const apiKey = request.headers.get("X-API-Key");

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing X-API-Key header" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!apiKey.startsWith("sk_")) {
    return new Response(
      JSON.stringify({ error: "Invalid API key format" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const keyHash = await hashKey(apiKey);
  const apiKeyDoc = await convex.query(api.apiKeys.getByHash, { keyHash });

  if (!apiKeyDoc) {
    return new Response(
      JSON.stringify({ error: "Invalid API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

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
