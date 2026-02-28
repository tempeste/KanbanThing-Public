import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  inspectRepoCredentials: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: mocks.validateApiKey,
}));

vi.mock("@/lib/kanbanthing-workspace-mapping", () => ({
  inspectRepoCredentials: mocks.inspectRepoCredentials,
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));

import { POST } from "@/app/api/openclaw/workspace-mapping/inspect/route";

const makeRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/openclaw/workspace-mapping/inspect", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/openclaw/workspace-mapping/inspect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue({
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      keyName: "Agent Key",
      keyRole: "admin",
    });
    mocks.inspectRepoCredentials.mockReturnValue({
      fingerprint: "f1",
      apiKeyPresent: true,
      baseUrl: "http://localhost:3000",
      declaredWorkspaceId: "ws_1",
    });
  });

  it("returns credential inspection details", async () => {
    const response = await POST(makeRequest({ repoPath: "/tmp/repo" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      workspaceIdExpected: "ws_1",
      declaredWorkspaceId: "ws_1",
      hasApiKey: true,
      baseUrl: "http://localhost:3000",
      mismatch: false,
    });
  });

  it("returns 422 when workspace id mismatches", async () => {
    mocks.inspectRepoCredentials.mockReturnValue({
      fingerprint: "f1",
      apiKeyPresent: true,
      baseUrl: "http://localhost:3000",
      declaredWorkspaceId: "ws_other",
    });
    const response = await POST(
      makeRequest({ repoPath: "/tmp/repo", workspaceId: "ws_1" }),
    );
    expect(response.status).toBe(422);
  });
});
