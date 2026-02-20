import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: mocks.validateApiKey,
  getConvexClient: () => ({ query: mocks.query }),
}));

import { GET } from "./route";

const sampleTicket = {
  _id: "ticket_1",
  title: "Test ticket",
  description: "Desc with, commas",
  number: 1,
  status: "unclaimed",
  priority: "high",
  ownerId: null,
  ownerType: null,
  ownerDisplayName: null,
  parentId: null,
  order: 10,
  archived: false,
  childCount: 0,
  childDoneCount: 0,
  createdAt: 100,
  updatedAt: 200,
};

describe("GET /api/tickets/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue({
      workspaceId: "workspace_1",
      apiKeyId: "key_1",
      keyName: "Agent Key",
      keyRole: "admin",
    });
    mocks.query.mockResolvedValue([sampleTicket]);
  });

  it("returns JSON by default", async () => {
    const response = await GET(new NextRequest("http://localhost/api/tickets/export"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(body.tickets).toHaveLength(1);
    expect(body.tickets[0].id).toBe("ticket_1");
    expect(body.tickets[0].priority).toBe("high");
    expect(body.exportedAt).toBeTruthy();
  });

  it("returns JSON when format=json", async () => {
    const response = await GET(new NextRequest("http://localhost/api/tickets/export?format=json"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("tickets-export.json");
  });

  it("returns CSV when format=csv", async () => {
    const response = await GET(new NextRequest("http://localhost/api/tickets/export?format=csv"));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("tickets-export.csv");

    const lines = text.split("\n");
    expect(lines[0]).toContain("id,number,title");
    expect(lines).toHaveLength(2); // header + 1 row
  });

  it("escapes CSV values with commas", async () => {
    const response = await GET(new NextRequest("http://localhost/api/tickets/export?format=csv"));
    const text = await response.text();
    // "Desc with, commas" should be wrapped in quotes
    expect(text).toContain('"Desc with, commas"');
  });

  it("returns 400 for invalid format", async () => {
    const response = await GET(new NextRequest("http://localhost/api/tickets/export?format=xml"));
    expect(response.status).toBe(400);
  });

  it("returns error when auth fails", async () => {
    mocks.validateApiKey.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );
    const response = await GET(new NextRequest("http://localhost/api/tickets/export"));
    expect(response.status).toBe(401);
  });

  it("handles empty ticket list in CSV", async () => {
    mocks.query.mockResolvedValue([]);
    const response = await GET(new NextRequest("http://localhost/api/tickets/export?format=csv"));
    const text = await response.text();
    const lines = text.split("\n");
    expect(lines).toHaveLength(1); // header only
  });
});
