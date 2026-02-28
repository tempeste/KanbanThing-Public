import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  requireAdminApiKey: vi.fn(),
  inspectRepoCredentials: vi.fn(),
  upsertWorkspaceMappingEntry: vi.fn(),
  runWorkspaceMappingDoctor: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: mocks.validateApiKey,
  requireAdminApiKey: mocks.requireAdminApiKey,
}));

vi.mock("@/lib/kanbanthing-workspace-mapping", () => ({
  inspectRepoCredentials: mocks.inspectRepoCredentials,
  upsertWorkspaceMappingEntry: mocks.upsertWorkspaceMappingEntry,
  runWorkspaceMappingDoctor: mocks.runWorkspaceMappingDoctor,
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));

import { POST } from "@/app/api/openclaw/workspace-mapping/upsert/route";

const makeRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/openclaw/workspace-mapping/upsert", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/openclaw/workspace-mapping/upsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue({
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      keyName: "Admin Key",
      keyRole: "admin",
    });
    mocks.requireAdminApiKey.mockReturnValue(null);
    mocks.inspectRepoCredentials.mockReturnValue({
      fingerprint: "f1",
      apiKeyPresent: true,
      baseUrl: "http://localhost:3000",
      declaredWorkspaceId: "ws_1",
    });
    mocks.upsertWorkspaceMappingEntry.mockReturnValue({
      mappingFile: "/tmp/mapping.json",
      alias: "repo",
      created: true,
    });
    mocks.runWorkspaceMappingDoctor.mockReturnValue({
      ok: true,
      mappingFile: "/tmp/mapping.json",
      summary: { entries: 1, okEntries: 1, warnings: 0, errors: 0 },
      entries: [],
      issues: [],
    });
  });

  it("supports dry-run without writing mapping", async () => {
    const response = await POST(
      makeRequest({ repoPath: "/tmp/repo", workspaceId: "ws_1", dryRun: true }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect(mocks.upsertWorkspaceMappingEntry).not.toHaveBeenCalled();
    expect(body.candidate.workspaceId).toBe("ws_1");
  });

  it("writes mapping and returns doctor summary", async () => {
    const response = await POST(
      makeRequest({ repoPath: "/tmp/repo", workspaceId: "ws_1" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.upsertWorkspaceMappingEntry).toHaveBeenCalled();
    expect(body.alias).toBe("repo");
  });

  it("blocks non-admin API keys", async () => {
    mocks.requireAdminApiKey.mockReturnValue(
      Response.json({ error: "Admin API key required" }, { status: 403 }),
    );
    const response = await POST(
      makeRequest({ repoPath: "/tmp/repo", workspaceId: "ws_1" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.upsertWorkspaceMappingEntry).not.toHaveBeenCalled();
  });
});
