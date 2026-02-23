import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = path.resolve(
  process.cwd(),
  "openclaw/skills/kanbanthing/scripts/kanbanthing.sh"
);

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kanbanthing-helper-test-"));
  tempDirs.push(dir);
  return dir;
};

const write = (dir: string, relativePath: string, contents: string) => {
  const filePath = path.join(dir, relativePath);
  writeFileSync(filePath, contents);
  return filePath;
};

const runHelper = (cwd: string, args: string[]) =>
  spawnSync("bash", [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
  });

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("kanbanthing helper script routing", () => {
  it("fails closed when --workspace-id is missing from mapping", () => {
    const cwd = makeTempDir();
    const mappingFile = write(
      cwd,
      "mapping.json",
      JSON.stringify({
        workspaces: {
          known: { workspaceId: "w_known", dir: "/nonexistent" },
        },
      })
    );
    write(
      cwd,
      ".env",
      "KANBANTHING_API_KEY=sk_local\nKANBANTHING_API_URL=http://localhost:9999\n"
    );

    const result = runHelper(cwd, [
      "--workspace-id",
      "w_missing",
      "--mapping-file",
      mappingFile,
      "doctor",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Workspace ID not found in mapping");
    expect(result.stdout.trim()).toBe("");
  });

  it("fails closed when explicit mapping dir is stale", () => {
    const cwd = makeTempDir();
    const mappingFile = write(
      cwd,
      "mapping.json",
      JSON.stringify({
        workspaces: {
          target: { workspaceId: "w_target", dir: "/definitely/missing/path" },
        },
      })
    );
    write(
      cwd,
      ".env",
      "KANBANTHING_API_KEY=sk_local\nKANBANTHING_API_URL=http://localhost:9999\n"
    );

    const result = runHelper(cwd, [
      "--workspace-id",
      "w_target",
      "--mapping-file",
      mappingFile,
      "doctor",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Mapped dir does not exist for selected workspace");
    expect(result.stdout.trim()).toBe("");
  });

  it("falls back to cwd .env when no explicit selector is provided", () => {
    const cwd = makeTempDir();
    write(
      cwd,
      ".env",
      "KANBANTHING_API_KEY=sk_local\nKANBANTHING_API_URL=http://localhost:9999\n"
    );

    const result = runHelper(cwd, ["doctor"]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.routing.mappingUsed).toBe(false);
    expect(parsed.baseUrl).toBe("http://localhost:9999");
  });

  it("parses indented export lines in .env files", () => {
    const cwd = makeTempDir();
    write(
      cwd,
      ".env",
      "  export  KANBANTHING_API_KEY=sk_local\n  export   KANBANTHING_API_URL=http://localhost:9999\n"
    );

    const result = runHelper(cwd, ["doctor"]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hasApiKey).toBe(true);
    expect(parsed.baseUrl).toBe("http://localhost:9999");
  });

  it("fails with a friendly error for non-integer ticket-status --order", () => {
    const cwd = makeTempDir();
    write(
      cwd,
      ".env",
      "KANBANTHING_API_KEY=sk_local\nKANBANTHING_API_URL=http://localhost:9999\n"
    );

    const result = runHelper(cwd, [
      "ticket-status",
      "abc123",
      "in_progress",
      "--order",
      "nope",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ticket-status --order must be an integer");
    expect(result.stderr).not.toContain("jq:");
  });
});
