import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = vi.fn();
    mutation = vi.fn();
  },
}));

process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";

import { requireAdminApiKey, resolveAgentPrincipal } from "@/lib/api-auth";

describe("api auth helpers", () => {
  const baseAuth = {
    workspaceId: "workspace_1",
    keyName: "Agent Key",
    apiKeyId: "k_123",
    keyRole: "admin",
  } as const;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves to api key principal when session header is missing", () => {
    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: {
        "X-API-Key": "sk_example",
      },
    });

    const principal = resolveAgentPrincipal(request, baseAuth as never);
    expect(principal).toEqual({
      ownerId: "apikey:k_123",
      ownerType: "agent",
      ownerDisplayName: "Agent Key",
    });
  });

  it("resolves to session principal when header is valid", () => {
    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: {
        "X-Agent-Session-Id": "worker.42",
      },
    });

    const principal = resolveAgentPrincipal(request, baseAuth as never);
    expect(principal).toEqual({
      ownerId: "session:worker.42",
      ownerType: "agent",
      ownerDisplayName: "worker.42",
    });
  });

  it("rejects invalid session ids", async () => {
    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: {
        "X-Agent-Session-Id": "bad id",
      },
    });

    const principal = resolveAgentPrincipal(request, baseAuth as never);
    expect(principal).toBeInstanceOf(Response);

    const response = principal as Response;
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid X-Agent-Session-Id",
    });
  });

  it("rejects session ids longer than max length", async () => {
    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: {
        "X-Agent-Session-Id": "a".repeat(129),
      },
    });

    const principal = resolveAgentPrincipal(request, baseAuth as never);
    expect(principal).toBeInstanceOf(Response);

    const response = principal as Response;
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid X-Agent-Session-Id",
    });
  });

  it("allows admin keys for key-management endpoints", () => {
    const response = requireAdminApiKey(baseAuth as never);
    expect(response).toBeNull();
  });

  it("blocks non-admin keys for key-management endpoints", async () => {
    const response = requireAdminApiKey({
      ...baseAuth,
      keyRole: "agent",
    } as never);

    expect(response).toBeInstanceOf(Response);

    const res = response as Response;
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Admin API key required",
    });
  });
});
