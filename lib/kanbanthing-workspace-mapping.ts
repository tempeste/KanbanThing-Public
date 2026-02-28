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

export type MappingIssueCode =
  | "not_mapped"
  | "invalid_mapping_file"
  | "duplicate_workspace_id"
  | "missing_repo_dir"
  | "missing_api_key"
  | "missing_base_url"
  | "workspace_id_mismatch"
  | "unsupported_entry_shape";

export type MappingIssue = {
  code: MappingIssueCode;
  severity: "error" | "warning";
  message: string;
  alias?: string;
  workspaceId?: string;
};

export type MappingDoctorEntry = {
  alias: string;
  workspaceId: string;
  dir?: string;
  apiUrl?: string;
  status: "ok" | "error";
  issues: MappingIssue[];
};

export type MappingDoctorReport = {
  ok: boolean;
  mappingFile: string;
  summary: {
    entries: number;
    okEntries: number;
    warnings: number;
    errors: number;
  };
  entries: MappingDoctorEntry[];
  issues: MappingIssue[];
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

type RawMappingEntry = {
  alias: string;
  workspaceId?: string;
  dir?: string;
  apiUrl?: string;
  envFiles?: string[];
  validShape: boolean;
};

function extractRawEntries(
  raw: unknown,
  mappingFilePath: string,
): RawMappingEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const workspaces = (raw as Record<string, unknown>).workspaces;
  const out: RawMappingEntry[] = [];

  const makeEntry = (aliasHint: string, entryRaw: unknown) => {
    if (!entryRaw || typeof entryRaw !== "object") {
      out.push({ alias: aliasHint, validShape: false });
      return;
    }
    const entry = entryRaw as Record<string, unknown>;
    const workspaceId = trimString(entry.workspaceId) || undefined;
    const dirRaw = trimString(entry.dir);
    const dir = dirRaw
      ? path.isAbsolute(dirRaw)
        ? dirRaw
        : path.resolve(path.dirname(mappingFilePath), dirRaw)
      : undefined;
    out.push({
      alias: trimString(entry.alias) || aliasHint || workspaceId || "unknown",
      workspaceId,
      dir,
      apiUrl: trimString(entry.apiUrl) || undefined,
      envFiles: Array.isArray(entry.envFiles)
        ? entry.envFiles.filter((f): f is string => typeof f === "string")
        : undefined,
      validShape: true,
    });
  };

  if (Array.isArray(workspaces)) {
    workspaces.forEach((entry, idx) => makeEntry(`entry_${idx + 1}`, entry));
    return out;
  }
  if (workspaces && typeof workspaces === "object") {
    Object.entries(workspaces as Record<string, unknown>).forEach(
      ([alias, entry]) => makeEntry(alias, entry),
    );
  }
  return out;
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

export function runWorkspaceMappingDoctor(params: {
  mappingFilePath: string;
  workspaceId?: string;
}): MappingDoctorReport {
  const mappingFile = path.resolve(params.mappingFilePath);
  const issues: MappingIssue[] = [];
  const entries: MappingDoctorEntry[] = [];

  if (!existsSync(mappingFile)) {
    issues.push({
      code: "invalid_mapping_file",
      severity: "error",
      message: `Mapping file not found: ${mappingFile}`,
    });
    return {
      ok: false,
      mappingFile,
      summary: { entries: 0, okEntries: 0, warnings: 0, errors: 1 },
      entries,
      issues,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(mappingFile, "utf8")) as unknown;
  } catch (error) {
    issues.push({
      code: "invalid_mapping_file",
      severity: "error",
      message: `Invalid mapping JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    return {
      ok: false,
      mappingFile,
      summary: { entries: 0, okEntries: 0, warnings: 0, errors: 1 },
      entries,
      issues,
    };
  }

  const rawEntries = extractRawEntries(raw, mappingFile);
  const workspaceCounts = new Map<string, number>();
  rawEntries.forEach((entry) => {
    if (entry.workspaceId) {
      workspaceCounts.set(
        entry.workspaceId,
        (workspaceCounts.get(entry.workspaceId) ?? 0) + 1,
      );
    }
  });

  for (const entry of rawEntries) {
    const entryIssues: MappingIssue[] = [];
    if (!entry.validShape) {
      entryIssues.push({
        code: "unsupported_entry_shape",
        severity: "error",
        alias: entry.alias,
        message: `Unsupported entry shape for alias ${entry.alias}`,
      });
    }
    if (!entry.workspaceId) {
      entryIssues.push({
        code: "unsupported_entry_shape",
        severity: "error",
        alias: entry.alias,
        message: `Missing workspaceId for alias ${entry.alias}`,
      });
    } else if ((workspaceCounts.get(entry.workspaceId) ?? 0) > 1) {
      entryIssues.push({
        code: "duplicate_workspace_id",
        severity: "error",
        alias: entry.alias,
        workspaceId: entry.workspaceId,
        message: `Workspace ID ${entry.workspaceId} appears multiple times`,
      });
    }

    if (!entry.dir || !existsSync(entry.dir)) {
      entryIssues.push({
        code: "missing_repo_dir",
        severity: "error",
        alias: entry.alias,
        workspaceId: entry.workspaceId,
        message: `Mapped repo directory missing for alias ${entry.alias}`,
      });
    } else if (entry.workspaceId) {
      const creds = resolveRepoCredentials({
        repoDir: entry.dir,
        workspaceId: entry.workspaceId,
        apiUrlFallback: entry.apiUrl,
        envFiles: entry.envFiles,
      });
      if (!creds.ok) {
        const codeMap: Record<RepoCredentialErrorCode, MappingIssueCode> = {
          missing_api_key: "missing_api_key",
          missing_base_url: "missing_base_url",
          workspace_id_mismatch: "workspace_id_mismatch",
        };
        entryIssues.push({
          code: codeMap[creds.code],
          severity: "error",
          alias: entry.alias,
          workspaceId: entry.workspaceId,
          message: `Credential validation failed: ${creds.code}`,
        });
      }
    }

    entries.push({
      alias: entry.alias,
      workspaceId: entry.workspaceId ?? "",
      dir: entry.dir,
      apiUrl: entry.apiUrl,
      status: entryIssues.length === 0 ? "ok" : "error",
      issues: entryIssues,
    });
    issues.push(...entryIssues);
  }

  if (params.workspaceId) {
    const matched = entries.find(
      (entry) => entry.workspaceId === params.workspaceId,
    );
    if (!matched) {
      issues.push({
        code: "not_mapped",
        severity: "error",
        workspaceId: params.workspaceId,
        message: `Workspace ${params.workspaceId} is not mapped`,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const okEntries = entries.filter((e) => e.status === "ok").length;
  return {
    ok: errorCount === 0,
    mappingFile,
    summary: {
      entries: entries.length,
      okEntries,
      warnings: warningCount,
      errors: errorCount,
    },
    entries,
    issues,
  };
}
