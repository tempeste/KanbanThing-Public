import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  requireAdminApiKey: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: mocks.validateApiKey,
  requireAdminApiKey: mocks.requireAdminApiKey,
  getConvexClient: () => ({ mutation: mocks.mutation }),
}));

import { POST } from "./route";

const makeRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/tickets/bulk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/tickets/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue({
      workspaceId: "workspace_1",
      apiKeyId: "key_1",
      keyName: "Agent Key",
      keyRole: "admin",
    });
    mocks.requireAdminApiKey.mockReturnValue(null);
    mocks.mutation.mockResolvedValue(undefined);
  });

  it("archives tickets", async () => {
    const response = await POST(makeRequest({ action: "archive", ids: ["t1", "t2"] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, action: "archive", count: 2 });
    expect(mocks.mutation).toHaveBeenCalledOnce();
  });

  it("unarchives tickets", async () => {
    const response = await POST(makeRequest({ action: "unarchive", ids: ["t1"] }));
    const body = await response.json();

    expect(body).toMatchObject({ success: true, action: "unarchive", count: 1 });
  });

  it("deletes tickets with admin key", async () => {
    const response = await POST(makeRequest({ action: "delete", ids: ["t1"] }));
    const body = await response.json();

    expect(body).toMatchObject({ success: true, action: "delete", count: 1 });
    expect(mocks.requireAdminApiKey).toHaveBeenCalled();
  });

  it("rejects delete without admin key", async () => {
    mocks.requireAdminApiKey.mockReturnValue(
      Response.json({ error: "Admin key required" }, { status: 403 })
    );
    const response = await POST(makeRequest({ action: "delete", ids: ["t1"] }));
    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects empty ids", async () => {
    const response = await POST(makeRequest({ action: "archive", ids: [] }));
    expect(response.status).toBe(400);
  });

  it("rejects more than 100 ids", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `t${i}`);
    const response = await POST(makeRequest({ action: "archive", ids }));
    expect(response.status).toBe(400);
  });

  it("rejects non-string ids", async () => {
    const response = await POST(makeRequest({ action: "archive", ids: [1, 2] }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid action", async () => {
    const response = await POST(makeRequest({ action: "nuke", ids: ["t1"] }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON body", async () => {
    const request = new NextRequest("http://localhost/api/tickets/bulk", {
      method: "POST",
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid Convex IDs", async () => {
    mocks.mutation.mockRejectedValue(new Error("ArgumentValidationError: invalid id"));
    const response = await POST(makeRequest({ action: "archive", ids: ["bad-id"] }));
    expect(response.status).toBe(400);
  });
});
