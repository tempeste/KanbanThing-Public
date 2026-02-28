import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  requireAdminApiKey: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: mocks.validateApiKey,
  requireAdminApiKey: mocks.requireAdminApiKey,
}));

import { POST as inspectRoute } from "@/app/api/openclaw/workspace-mapping/inspect/route";
import { POST as upsertRoute } from "@/app/api/openclaw/workspace-mapping/upsert/route";
import { GET as doctorRoute } from "@/app/api/openclaw/workspace-mapping/doctor/route";

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kt-mapping-e2e-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const makePostRequest = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "X-API-Key": "sk_test" },
  });

const makeGetRequest = (url: string) =>
  new NextRequest(url, {
    method: "GET",
    headers: { "X-API-Key": "sk_test" },
  });

describe("workspace mapping wizard routes e2e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue({
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      keyName: "Admin Key",
      keyRole: "admin",
    });
    mocks.requireAdminApiKey.mockReturnValue(null);
  });

  it("upserts mapping then verifies with doctor for mapped workspace", async () => {
    const dir = makeTempDir();
    const repo = path.join(dir, "repo");
    mkdirSync(repo, { recursive: true });
    writeFileSync(
      path.join(repo, ".kanbanthing"),
      [
        "KANBANTHING_WORKSPACE_ID=ws_1",
        "KANBANTHING_API_KEY=sk_repo",
        "KANBANTHING_BASE_URL=http://127.0.0.1:3000",
      ].join("\n"),
      "utf8",
    );
    const mappingFile = path.join(dir, "mapping.json");
    writeFileSync(mappingFile, JSON.stringify({ workspaces: {} }), "utf8");

    const upsertResponse = await upsertRoute(
      makePostRequest(
        "http://localhost/api/openclaw/workspace-mapping/upsert",
        {
          repoPath: repo,
          workspaceId: "ws_1",
          mappingFile,
        },
      ),
    );
    const upsertBody = await upsertResponse.json();
    expect(upsertResponse.status).toBe(200);
    expect(upsertBody.ok).toBe(true);

    const doctorResponse = await doctorRoute(
      makeGetRequest(
        `http://localhost/api/openclaw/workspace-mapping/doctor?mappingFile=${encodeURIComponent(mappingFile)}&workspaceId=ws_1`,
      ),
    );
    const doctorBody = await doctorResponse.json();
    expect(doctorResponse.status).toBe(200);
    expect(doctorBody.ok).toBe(true);
    expect(doctorBody.summary.errors).toBe(0);
  });

  it("fails closed for unmapped workspace and workspace mismatch", async () => {
    const dir = makeTempDir();
    const repo = path.join(dir, "repo");
    mkdirSync(repo, { recursive: true });
    writeFileSync(
      path.join(repo, ".kanbanthing"),
      [
        "KANBANTHING_WORKSPACE_ID=ws_other",
        "KANBANTHING_API_KEY=sk_repo",
        "KANBANTHING_BASE_URL=http://127.0.0.1:3000",
      ].join("\n"),
      "utf8",
    );
    const mappingFile = path.join(dir, "mapping.json");

    const inspectResponse = await inspectRoute(
      makePostRequest(
        "http://localhost/api/openclaw/workspace-mapping/inspect",
        {
          repoPath: repo,
          workspaceId: "ws_1",
        },
      ),
    );
    const inspectBody = await inspectResponse.json();
    expect(inspectResponse.status).toBe(422);
    expect(inspectBody.mismatch).toBe(true);

    const doctorResponse = await doctorRoute(
      makeGetRequest(
        `http://localhost/api/openclaw/workspace-mapping/doctor?mappingFile=${encodeURIComponent(mappingFile)}&workspaceId=ws_1`,
      ),
    );
    const doctorBody = await doctorResponse.json();
    expect(doctorResponse.status).toBe(422);
    expect(doctorBody.ok).toBe(false);
    const issueCodes = doctorBody.issues.map((i: { code: string }) => i.code);
    expect(
      issueCodes.includes("not_mapped") || issueCodes.includes("invalid_mapping_file"),
    ).toBe(true);
  });
});
