import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { jsonError, sanitizeServerError } from "@/lib/api-route-helpers";
import { runWorkspaceMappingDoctor } from "@/lib/kanbanthing-workspace-mapping";

const DEFAULT_MAPPING_FILE = "~/.openclaw/kanbanthing-workspaces.json";

function resolveDefaultMappingFile() {
  const home = process.env.HOME?.trim();
  if (!home) return DEFAULT_MAPPING_FILE;
  return `${home}/.openclaw/kanbanthing-workspaces.json`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const { searchParams } = new URL(request.url);
    const mappingFile =
      searchParams.get("mappingFile")?.trim() || resolveDefaultMappingFile();
    const workspaceId =
      searchParams.get("workspaceId")?.trim() || String(auth.workspaceId);

    const report = runWorkspaceMappingDoctor({
      mappingFilePath: mappingFile,
      workspaceId,
    });
    return Response.json(report, { status: report.ok ? 200 : 422 });
  } catch (error) {
    return jsonError(
      sanitizeServerError(error, "Failed to run workspace mapping doctor"),
      500,
    );
  }
}
