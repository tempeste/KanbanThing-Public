import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type WorkspaceMappingEntry = {
  alias?: string;
  workspaceId: string;
  dir?: string;
  apiUrl?: string;
  envFiles?: string[];
};

export type WorkspaceMappingSnapshot = {
  path: string;
  mtimeMs: number;
  byWorkspaceId: Map<string, WorkspaceMappingEntry>;
};

export type RepoCredentialErrorCode =
  | "missing_api_key"
  | "missing_base_url"
  | "workspace_id_mismatch";

export type RepoCredentialResolution =
  | {
      ok: true;
      fingerprint: string;
      credentials: { apiKey: string; baseUrl: string };
      declaredWorkspaceId?: string;
    }
  | {
      ok: false;
      fingerprint: string;
      code: RepoCredentialErrorCode;
      declaredWorkspaceId?: string;
    };

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(input?: string | null) {
  if (!input) return null;
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function parseEnvStyleFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) {
      line = line.slice("export ".length).trim();
    }
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export function parseWorkspaceMappingEntries(
  raw: unknown,
  mappingFilePath: string,
): Map<string, WorkspaceMappingEntry> {
  const result = new Map<string, WorkspaceMappingEntry>();
  if (!raw || typeof raw !== "object") return result;
  const workspaces = (raw as Record<string, unknown>).workspaces;

  const addEntry = (entryRaw: unknown, aliasHint?: string) => {
    if (!entryRaw || typeof entryRaw !== "object") return;
    const entry = entryRaw as Record<string, unknown>;
    const workspaceId = trimString(entry.workspaceId);
    if (!workspaceId) return;
    const dirRaw = trimString(entry.dir);
    const dir = dirRaw
      ? path.isAbsolute(dirRaw)
        ? dirRaw
        : path.resolve(path.dirname(mappingFilePath), dirRaw)
      : "";
    result.set(workspaceId, {
      workspaceId,
      alias: trimString(entry.alias) || aliasHint,
      dir: dir || undefined,
      apiUrl: trimString(entry.apiUrl) || undefined,
      envFiles: Array.isArray(entry.envFiles)
        ? entry.envFiles.filter((f): f is string => typeof f === "string")
        : undefined,
    });
  };

  if (Array.isArray(workspaces)) {
    for (const entry of workspaces) addEntry(entry);
    return result;
  }
  if (workspaces && typeof workspaces === "object") {
    for (const [alias, entry] of Object.entries(
      workspaces as Record<string, unknown>,
    )) {
      addEntry(entry, alias);
    }
  }
  return result;
}

export function loadWorkspaceMappingSnapshot(
  mappingFilePath: string,
): WorkspaceMappingSnapshot {
  const fullPath = path.resolve(mappingFilePath);
  if (!existsSync(fullPath)) {
    throw new Error(`workspaceMappingFile not found: ${fullPath}`);
  }
  const st = statSync(fullPath);
  const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
  return {
    path: fullPath,
    mtimeMs: st.mtimeMs,
    byWorkspaceId: parseWorkspaceMappingEntries(parsed, fullPath),
  };
}

export function resolveRepoCredentials(params: {
  repoDir: string;
  workspaceId: string;
  apiUrlFallback?: string;
  envFiles?: string[];
}): RepoCredentialResolution {
  const defaultEnvFiles = [".env", ".env.local"];
  const envFiles =
    Array.isArray(params.envFiles) && params.envFiles.length > 0
      ? params.envFiles
          .filter((f): f is string => typeof f === "string")
          .map((f) => f.trim())
          .filter(Boolean)
      : defaultEnvFiles;
  const filesToRead = [".kanbanthing", ...envFiles];
  const mtimes: string[] = [];
  const merged: Record<string, string> = {};

  for (const rel of filesToRead) {
    const filePath = path.join(params.repoDir, rel);
    if (!existsSync(filePath)) continue;
    try {
      const st = statSync(filePath);
      mtimes.push(`${rel}:${st.mtimeMs}:${st.size}`);
      const parsed = parseEnvStyleFile(readFileSync(filePath, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        merged[key] = value;
      }
    } catch {
      mtimes.push(`${rel}:err`);
    }
  }

  const fingerprint = mtimes.join("|");
  const apiKey = trimString(merged.KANBANTHING_API_KEY);
  if (!apiKey) {
    return { ok: false, fingerprint, code: "missing_api_key" };
  }

  const rawBase =
    trimString(merged.KANBANTHING_API_URL) ||
    trimString(merged.KANBANTHING_BASE_URL) ||
    trimString(merged.KANBANTHING_URL) ||
    trimString(params.apiUrlFallback);
  const baseUrl = normalizeBaseUrl(rawBase);
  if (!baseUrl) {
    return { ok: false, fingerprint, code: "missing_base_url" };
  }

  const declaredWorkspaceId = trimString(merged.KANBANTHING_WORKSPACE_ID);
  if (declaredWorkspaceId && declaredWorkspaceId !== params.workspaceId) {
    return {
      ok: false,
      fingerprint,
      code: "workspace_id_mismatch",
      declaredWorkspaceId,
    };
  }

  return {
    ok: true,
    fingerprint,
    declaredWorkspaceId: declaredWorkspaceId || undefined,
    credentials: { apiKey, baseUrl },
  };
}
