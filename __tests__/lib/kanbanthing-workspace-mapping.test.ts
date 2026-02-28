import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectRepoCredentials,
  loadWorkspaceMappingSnapshot,
  parseEnvStyleFile,
  runWorkspaceMappingDoctor,
  resolveRepoCredentials,
  upsertWorkspaceMappingEntry,
} from "@/lib/kanbanthing-workspace-mapping";

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kt-workspace-mapping-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("kanbanthing workspace mapping shared module", () => {
  it("parses env style files including export and quoted values", () => {
    const parsed = parseEnvStyleFile(
      [
        "export KANBANTHING_API_KEY=sk_test",
        'KANBANTHING_BASE_URL="http://localhost:3000"',
      ].join("\n"),
    );
    expect(parsed.KANBANTHING_API_KEY).toBe("sk_test");
    expect(parsed.KANBANTHING_BASE_URL).toBe("http://localhost:3000");
  });

  it("loads workspace mapping snapshot with workspace index", () => {
    const dir = makeTempDir();
    const mappingFile = path.join(dir, "kanbanthing-workspaces.json");
    writeFileSync(
      mappingFile,
      JSON.stringify({
        workspaces: {
          openclaw: {
            workspaceId: "ws_openclaw",
            dir: "./repos/openclaw",
            apiUrl: "http://127.0.0.1:3000",
          },
        },
      }),
      "utf8",
    );
    const snapshot = loadWorkspaceMappingSnapshot(mappingFile);
    const entry = snapshot.byWorkspaceId.get("ws_openclaw");

    expect(entry).toBeDefined();
    expect(entry?.alias).toBe("openclaw");
    expect(entry?.dir).toBe(path.resolve(dir, "repos/openclaw"));
  });

  it("resolves credentials and fails on workspace mismatch", () => {
    const dir = makeTempDir();
    const repo = path.join(dir, "repo");
    mkdirSync(repo, { recursive: true });

    writeFileSync(
      path.join(repo, ".kanbanthing"),
      [
        "KANBANTHING_WORKSPACE_ID=ws_other",
        "KANBANTHING_API_KEY=sk_repo",
        "KANBANTHING_BASE_URL=http://localhost:3000",
      ].join("\n"),
      "utf8",
    );

    const mismatch = resolveRepoCredentials({
      repoDir: repo,
      workspaceId: "ws_expected",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.code).toBe("workspace_id_mismatch");
    }

    writeFileSync(
      path.join(repo, ".kanbanthing"),
      [
        "KANBANTHING_WORKSPACE_ID=ws_expected",
        "KANBANTHING_API_KEY=sk_repo",
        "KANBANTHING_BASE_URL=http://localhost:3000",
      ].join("\n"),
      "utf8",
    );

    const resolved = resolveRepoCredentials({
      repoDir: repo,
      workspaceId: "ws_expected",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.credentials.apiKey).toBe("sk_repo");
      expect(resolved.credentials.baseUrl).toBe("http://localhost:3000");
    }
  });

  it("produces doctor issues for duplicate and unmapped workspace", () => {
    const dir = makeTempDir();
    const repoA = path.join(dir, "repo-a");
    const repoB = path.join(dir, "repo-b");
    mkdirSync(repoA, { recursive: true });
    mkdirSync(repoB, { recursive: true });
    writeFileSync(
      path.join(repoA, ".kanbanthing"),
      [
        "KANBANTHING_WORKSPACE_ID=ws_dup",
        "KANBANTHING_API_KEY=sk_a",
        "KANBANTHING_BASE_URL=http://localhost:3000",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(repoB, ".kanbanthing"),
      [
        "KANBANTHING_WORKSPACE_ID=ws_dup",
        "KANBANTHING_API_KEY=sk_b",
        "KANBANTHING_BASE_URL=http://localhost:3000",
      ].join("\n"),
      "utf8",
    );
    const mappingFile = path.join(dir, "mapping.json");
    writeFileSync(
      mappingFile,
      JSON.stringify({
        workspaces: [
          { alias: "a", workspaceId: "ws_dup", dir: repoA },
          { alias: "b", workspaceId: "ws_dup", dir: repoB },
        ],
      }),
      "utf8",
    );

    const report = runWorkspaceMappingDoctor({
      mappingFilePath: mappingFile,
      workspaceId: "ws_missing",
    });
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain("duplicate_workspace_id");
    expect(codes).toContain("not_mapped");
    expect(report.ok).toBe(false);
  });

  it("upserts mapping entries atomically with conflict checks", () => {
    const dir = makeTempDir();
    const mappingFile = path.join(dir, "mapping.json");

    const first = upsertWorkspaceMappingEntry({
      mappingFilePath: mappingFile,
      workspaceId: "ws_1",
      repoDir: path.join(dir, "repo-a"),
      alias: "openclaw",
    });
    expect(first.created).toBe(true);

    expect(() =>
      upsertWorkspaceMappingEntry({
        mappingFilePath: mappingFile,
        workspaceId: "ws_2",
        repoDir: path.join(dir, "repo-b"),
        alias: "openclaw",
      }),
    ).toThrow(/Alias openclaw already maps to ws_1/);

    const forced = upsertWorkspaceMappingEntry({
      mappingFilePath: mappingFile,
      workspaceId: "ws_2",
      repoDir: path.join(dir, "repo-b"),
      alias: "openclaw",
      force: true,
    });
    expect(forced.created).toBe(false);
    const snapshot = loadWorkspaceMappingSnapshot(mappingFile);
    expect(snapshot.byWorkspaceId.get("ws_2")?.dir).toBe(
      path.join(dir, "repo-b"),
    );
  });

  it("inspects repo credentials without exposing raw api key", () => {
    const dir = makeTempDir();
    writeFileSync(
      path.join(dir, ".kanbanthing"),
      [
        "KANBANTHING_WORKSPACE_ID=ws_x",
        "KANBANTHING_API_KEY=sk_secret",
        "KANBANTHING_BASE_URL=http://localhost:3000",
      ].join("\n"),
      "utf8",
    );
    const inspected = inspectRepoCredentials({ repoDir: dir });
    expect(inspected.apiKeyPresent).toBe(true);
    expect(inspected.baseUrl).toBe("http://localhost:3000");
    expect(inspected.declaredWorkspaceId).toBe("ws_x");
  });
});
