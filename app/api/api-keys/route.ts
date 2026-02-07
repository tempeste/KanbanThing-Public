import { NextRequest } from "next/server";
import {
  getConvexClient,
  requireAdminApiKey,
  validateApiKey,
} from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";

const KEY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY_LENGTH = 32;

const generateApiKey = () => {
  const values = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  let key = "sk_";
  for (const value of values) {
    key += KEY_CHARS[value % KEY_CHARS.length];
  }
  return key;
};

const hashKey = async (key: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;
  const adminGuard = requireAdminApiKey(auth);
  if (adminGuard) return adminGuard;

  const convex = getConvexClient();
  const keys = await convex.query(api.apiKeys.list, {
    workspaceId: auth.workspaceId,
    agentApiKeyId: auth.apiKeyId,
  });

  return Response.json({
    apiKeys: keys.map((key) => ({
      id: key._id,
      name: key.name,
      role: key.role ?? "admin",
      createdAt: key.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;
  const adminGuard = requireAdminApiKey(auth);
  if (adminGuard) return adminGuard;

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; role?: unknown }
    | null;
  if (!body || typeof body.name !== "string" || body.name.trim() === "") {
    return Response.json({ error: "Invalid name" }, { status: 400 });
  }
  if (
    body.role !== undefined &&
    body.role !== "agent" &&
    body.role !== "admin"
  ) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  const name = body.name.trim();
  if (name.length > 100) {
    return Response.json({ error: "Name too long" }, { status: 400 });
  }

  const newKey = generateApiKey();
  const keyHash = await hashKey(newKey);
  const role = body.role === "admin" ? "admin" : "agent";
  const convex = getConvexClient();

  const id = await convex.mutation(api.apiKeys.create, {
    workspaceId: auth.workspaceId,
    keyHash,
    name,
    role,
    agentApiKeyId: auth.apiKeyId,
  });

  const created = await convex.query(api.apiKeys.get, {
    id,
    agentApiKeyId: auth.apiKeyId,
  });
  if (!created) {
    return Response.json({ error: "Failed to create API key" }, { status: 500 });
  }

  return Response.json({
    apiKey: {
      id: created._id,
      name: created.name,
      role: created.role ?? "admin",
      createdAt: created.createdAt,
    },
    secret: newKey,
  });
}
