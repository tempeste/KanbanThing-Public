import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  runWorkspaceMappingDoctor: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: mocks.validateApiKey,
}));

vi.mock("@/lib/kanbanthing-workspace-mapping", () => ({
  runWorkspaceMappingDoctor: mocks.runWorkspaceMappingDoctor,
}));

import { GET } from "@/app/api/openclaw/workspace-mapping/doctor/route";

const makeRequest = (query = "") =>
  new NextRequest(
    `http://localhost/api/openclaw/workspace-mapping/doctor${query}`,
    {
      method: "GET",
    },
  );

describe("GET /api/openclaw/workspace-mapping/doctor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue({
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      keyName: "Agent Key",
      keyRole: "admin",
    });
  });

  it("returns 200 when doctor report is healthy", async () => {
    mocks.runWorkspaceMappingDoctor.mockReturnValue({
      ok: true,
      mappingFile: "/tmp/mapping.json",
      summary: { entries: 1, okEntries: 1, warnings: 0, errors: 0 },
      entries: [],
      issues: [],
    });

    const response = await GET(
      makeRequest("?mappingFile=%2Ftmp%2Fmapping.json"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.runWorkspaceMappingDoctor).toHaveBeenCalledWith({
      mappingFilePath: "/tmp/mapping.json",
      workspaceId: "ws_1",
    });
  });

  it("returns 422 when doctor report contains errors", async () => {
    mocks.runWorkspaceMappingDoctor.mockReturnValue({
      ok: false,
      mappingFile: "/tmp/mapping.json",
      summary: { entries: 0, okEntries: 0, warnings: 0, errors: 1 },
      entries: [],
      issues: [
        {
          code: "not_mapped",
          severity: "error",
          message: "Workspace ws_1 is not mapped",
          workspaceId: "ws_1",
        },
      ],
    });

    const response = await GET(makeRequest());
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.issues[0].code).toBe("not_mapped");
  });

  it("returns auth response when validateApiKey fails", async () => {
    mocks.validateApiKey.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(mocks.runWorkspaceMappingDoctor).not.toHaveBeenCalled();
  });
});
