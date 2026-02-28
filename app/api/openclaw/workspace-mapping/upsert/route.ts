import { NextRequest } from "next/server";
import { requireAdminApiKey, validateApiKey } from "@/lib/api-auth";
import { jsonError, sanitizeServerError } from "@/lib/api-route-helpers";
import {
  inspectRepoCredentials,
  runWorkspaceMappingDoctor,
  upsertWorkspaceMappingEntry,
} from "@/lib/kanbanthing-workspace-mapping";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_MAPPING_FILE = "~/.openclaw/kanbanthing-workspaces.json";

function resolveDefaultMappingFile() {
  const home = process.env.HOME?.trim();
  if (!home) return DEFAULT_MAPPING_FILE;
  return `${home}/.openclaw/kanbanthing-workspaces.json`;
}

type UpsertBody = {
  repoPath?: string;
  workspaceId?: string;
  alias?: string;
  mappingFile?: string;
  envFiles?: string[];
  apiUrl?: string;
  dryRun?: boolean;
  force?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;
    const adminError = requireAdminApiKey(auth);
    if (adminError) return adminError;

    const body = (await request.json()) as UpsertBody;
    const repoPath =
      typeof body.repoPath === "string" ? body.repoPath.trim() : "";
    if (!repoPath) {
      return jsonError("repoPath is required", 400);
    }
    const resolvedRepoPath = path.resolve(repoPath);
    if (
      !existsSync(resolvedRepoPath) ||
      !statSync(resolvedRepoPath).isDirectory()
    ) {
      return jsonError("repoPath must point to an existing directory", 400);
    }

    const inspected = inspectRepoCredentials({
      repoDir: resolvedRepoPath,
      envFiles: Array.isArray(body.envFiles) ? body.envFiles : undefined,
      apiUrlFallback: typeof body.apiUrl === "string" ? body.apiUrl : undefined,
    });
    const workspaceId =
      (typeof body.workspaceId === "string" && body.workspaceId.trim()) ||
      inspected.declaredWorkspaceId ||
      "";
    if (!workspaceId) {
      return jsonError(
        "workspaceId is required (provide it or set KANBANTHING_WORKSPACE_ID in repo config)",
        400,
      );
    }
    if (
      inspected.declaredWorkspaceId &&
      inspected.declaredWorkspaceId !== workspaceId
    ) {
      return jsonError("workspaceId does not match repo credentials", 422, {
        expected: workspaceId,
        declaredWorkspaceId: inspected.declaredWorkspaceId,
      });
    }

    const mappingFile =
      typeof body.mappingFile === "string" && body.mappingFile.trim()
        ? body.mappingFile.trim()
        : resolveDefaultMappingFile();
    const dryRun = body.dryRun === true;
    const force = body.force === true;

    if (dryRun) {
      const doctor = runWorkspaceMappingDoctor({
        mappingFilePath: mappingFile,
        workspaceId,
      });
      return Response.json({
        ok: true,
        dryRun: true,
        candidate: {
          alias:
            typeof body.alias === "string" && body.alias.trim()
              ? body.alias.trim()
              : path.basename(resolvedRepoPath),
          workspaceId,
          repoPath: resolvedRepoPath,
          apiUrl: inspected.baseUrl,
          hasApiKey: inspected.apiKeyPresent,
        },
        doctor,
      });
    }

    const result = upsertWorkspaceMappingEntry({
      mappingFilePath: mappingFile,
      workspaceId,
      repoDir: resolvedRepoPath,
      alias: typeof body.alias === "string" ? body.alias : undefined,
      apiUrl:
        inspected.baseUrl ??
        (typeof body.apiUrl === "string" ? body.apiUrl : undefined),
      envFiles: Array.isArray(body.envFiles) ? body.envFiles : undefined,
      force,
    });
    const doctor = runWorkspaceMappingDoctor({
      mappingFilePath: mappingFile,
      workspaceId,
    });
    return Response.json({
      ok: true,
      ...result,
      doctor,
    });
  } catch (error) {
    return jsonError(
      sanitizeServerError(error, "Failed to upsert workspace mapping"),
      500,
    );
  }
}
