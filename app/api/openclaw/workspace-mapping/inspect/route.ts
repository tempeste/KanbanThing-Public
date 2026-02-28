import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { jsonError, sanitizeServerError } from "@/lib/api-route-helpers";
import { inspectRepoCredentials } from "@/lib/kanbanthing-workspace-mapping";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

type InspectBody = {
  repoPath?: string;
  workspaceId?: string;
  envFiles?: string[];
  apiUrlFallback?: string;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const body = (await request.json()) as InspectBody;
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

    const expectedWorkspaceId =
      typeof body.workspaceId === "string" && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : String(auth.workspaceId);
    const inspected = inspectRepoCredentials({
      repoDir: resolvedRepoPath,
      envFiles: Array.isArray(body.envFiles) ? body.envFiles : undefined,
      apiUrlFallback:
        typeof body.apiUrlFallback === "string"
          ? body.apiUrlFallback
          : undefined,
    });
    const mismatch = Boolean(
      inspected.declaredWorkspaceId &&
      inspected.declaredWorkspaceId !== expectedWorkspaceId,
    );

    return Response.json(
      {
        ok: !mismatch && inspected.apiKeyPresent && Boolean(inspected.baseUrl),
        repoPath: resolvedRepoPath,
        workspaceIdExpected: expectedWorkspaceId,
        declaredWorkspaceId: inspected.declaredWorkspaceId ?? null,
        hasApiKey: inspected.apiKeyPresent,
        baseUrl: inspected.baseUrl,
        mismatch,
      },
      { status: mismatch ? 422 : 200 },
    );
  } catch (error) {
    return jsonError(
      sanitizeServerError(error, "Failed to inspect repo credentials"),
      500,
    );
  }
}
