import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: mocks.validateApiKey,
  getConvexClient: () => ({ mutation: mocks.mutation }),
}));

import { POST } from "@/app/api/openclaw/dispatch-events/route";

const makeRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/openclaw/dispatch-events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/openclaw/dispatch-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue({
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      keyName: "Agent Key",
      keyRole: "admin",
    });
    mocks.mutation.mockResolvedValue({ success: true, count: 1, patchedRunIdCount: 0 });
  });

  it("accepts a valid dispatch.received callback", async () => {
    const response = await POST(
      makeRequest({
        workspaceId: "ws_1",
        event: "dispatch.received",
        ticketIds: ["t1"],
        eventId: "evt_1",
        dispatchId: "d_1",
        message: "received",
        metadata: { source: "plugin" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      result: { success: true, count: 1, patchedRunIdCount: 0 },
    });
    expect(mocks.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: "ws_1",
        ticketIds: ["t1"],
        eventType: "dispatch.received",
        eventId: "evt_1",
        dispatchId: "d_1",
        message: "received",
        metadata: { source: "plugin" },
        agentApiKeyId: "key_1",
      })
    );
  });

  it("rejects workspace mismatch", async () => {
    const response = await POST(
      makeRequest({
        workspaceId: "ws_other",
        event: "dispatch.received",
        ticketIds: ["t1"],
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects unsupported event type", async () => {
    const response = await POST(
      makeRequest({
        workspaceId: "ws_1",
        event: "dispatch.unknown",
        ticketIds: ["t1"],
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects empty ticketIds", async () => {
    const response = await POST(
      makeRequest({
        workspaceId: "ws_1",
        event: "dispatch.received",
        ticketIds: [],
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects non-string message", async () => {
    const response = await POST(
      makeRequest({
        workspaceId: "ws_1",
        event: "dispatch.received",
        ticketIds: ["t1"],
        message: 123,
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("returns auth response when validateApiKey fails", async () => {
    mocks.validateApiKey.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await POST(
      makeRequest({
        workspaceId: "ws_1",
        event: "dispatch.received",
        ticketIds: ["t1"],
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
