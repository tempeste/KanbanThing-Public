import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: mocks.validateApiKey,
  getConvexClient: () => ({
    query: mocks.query,
    mutation: mocks.mutation,
  }),
}));

import { GET } from "./route";

describe("GET /api/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue({
      workspaceId: "workspace_1",
      apiKeyId: "key_1",
      keyName: "Agent Key",
      keyRole: "admin",
    });
  });

  it("returns summary payload when fields=summary", async () => {
    mocks.query.mockResolvedValueOnce([
      {
        _id: "ticket_1",
        title: "Fast list",
        number: 1,
        status: "unclaimed",
        ownerId: undefined,
        ownerType: undefined,
        ownerDisplayName: undefined,
        parentId: null,
        order: 10,
        archived: false,
        childCount: 0,
        childDoneCount: 0,
        createdAt: 10,
        updatedAt: 10,
      },
    ]);

    const request = new NextRequest("http://localhost/api/tickets?fields=summary");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(api.tickets.listSummaries, {
      workspaceId: "workspace_1",
      limit: undefined,
      agentApiKeyId: "key_1",
    });
    expect(payload.tickets[0]).not.toHaveProperty("description");
    expect(payload.tickets[0]).toMatchObject({
      id: "ticket_1",
      title: "Fast list",
      status: "unclaimed",
    });
  });

  it("keeps full payload by default", async () => {
    mocks.query.mockResolvedValueOnce([
      {
        _id: "ticket_2",
        title: "Full payload",
        description: "Keep me",
        number: 2,
        status: "done",
        ownerId: null,
        ownerType: null,
        ownerDisplayName: null,
        parentId: null,
        order: 20,
        archived: false,
        childCount: 0,
        childDoneCount: 0,
        createdAt: 20,
        updatedAt: 20,
      },
    ]);

    const request = new NextRequest("http://localhost/api/tickets");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(api.tickets.list, {
      workspaceId: "workspace_1",
      limit: undefined,
      agentApiKeyId: "key_1",
    });
    expect(payload.tickets[0].description).toBe("Keep me");
  });

  it("returns 400 for invalid fields option", async () => {
    const request = new NextRequest("http://localhost/api/tickets?fields=lite");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "Invalid fields" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("uses summary parent+status index path when filtered", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const request = new NextRequest(
      "http://localhost/api/tickets?fields=summary&parentId=root&status=done"
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(api.tickets.listSummariesByParentAndStatus, {
      workspaceId: "workspace_1",
      parentId: null,
      status: "done",
      limit: undefined,
      agentApiKeyId: "key_1",
    });
    expect(payload).toEqual({ tickets: [] });
  });
});
