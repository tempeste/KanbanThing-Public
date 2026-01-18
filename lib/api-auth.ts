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
}

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
  };
}

export function getConvexClient() {
  return convex;
}
