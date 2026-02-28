"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InspectResponse = {
  ok: boolean;
  repoPath: string;
  workspaceIdExpected: string;
  declaredWorkspaceId: string | null;
  hasApiKey: boolean;
  baseUrl: string | null;
  mismatch: boolean;
};

type DoctorResponse = {
  ok: boolean;
  summary: {
    entries: number;
    okEntries: number;
    warnings: number;
    errors: number;
  };
  issues: Array<{ code: string; severity: string; message: string }>;
};

export function OpenClawMappingWizardCard({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [apiKey, setApiKey] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [alias, setAlias] = useState("");
  const [mappingFile, setMappingFile] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [inspectResult, setInspectResult] = useState<InspectResponse | null>(
    null,
  );
  const [doctorResult, setDoctorResult] = useState<DoctorResponse | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const buildHeaders = () => ({
    "Content-Type": "application/json",
    "X-API-Key": apiKey.trim(),
  });

  const requireInputs = () => {
    if (!apiKey.trim()) {
      setStatusText("Admin API key is required.");
      return false;
    }
    if (!repoPath.trim()) {
      setStatusText("Local repo path is required.");
      return false;
    }
    return true;
  };

  const runInspect = async () => {
    if (!requireInputs()) return;
    setIsBusy(true);
    setStatusText(null);
    try {
      const response = await fetch("/api/openclaw/workspace-mapping/inspect", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          repoPath: repoPath.trim(),
          workspaceId,
        }),
      });
      const body = (await response.json()) as
        | InspectResponse
        | { error?: string };
      if (!response.ok) {
        setStatusText((body as { error?: string }).error ?? "Inspect failed.");
        return;
      }
      setInspectResult(body as InspectResponse);
      setStatusText("Inspect succeeded.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Inspect failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const runUpsert = async (dryRun: boolean) => {
    if (!requireInputs()) return;
    setIsBusy(true);
    setStatusText(null);
    try {
      const response = await fetch("/api/openclaw/workspace-mapping/upsert", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          repoPath: repoPath.trim(),
          workspaceId,
          dryRun,
          ...(alias.trim() ? { alias: alias.trim() } : {}),
          ...(mappingFile.trim() ? { mappingFile: mappingFile.trim() } : {}),
        }),
      });
      const body = (await response.json()) as
        | {
            ok: true;
            doctor?: DoctorResponse;
            created?: boolean;
            alias?: string;
          }
        | { error?: string };
      if (!response.ok || !("ok" in body && body.ok)) {
        setStatusText((body as { error?: string }).error ?? "Upsert failed.");
        return;
      }
      if (body.doctor) setDoctorResult(body.doctor);
      setStatusText(
        dryRun
          ? "Dry-run passed. Review result then click Save Mapping."
          : `Mapping saved${body.alias ? ` (alias: ${body.alias})` : ""}.`,
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Upsert failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const runDoctor = async () => {
    if (!apiKey.trim()) {
      setStatusText("Admin API key is required.");
      return;
    }
    setIsBusy(true);
    setStatusText(null);
    try {
      const query = new URLSearchParams({ workspaceId });
      if (mappingFile.trim()) query.set("mappingFile", mappingFile.trim());
      const response = await fetch(
        `/api/openclaw/workspace-mapping/doctor?${query.toString()}`,
        { headers: { "X-API-Key": apiKey.trim() } },
      );
      const body = (await response.json()) as
        | DoctorResponse
        | { error?: string };
      if (!response.ok && !("ok" in body)) {
        setStatusText((body as { error?: string }).error ?? "Doctor failed.");
        return;
      }
      setDoctorResult(body as DoctorResponse);
      setStatusText(
        (body as DoctorResponse).ok
          ? "Verification passed."
          : "Verification found issues.",
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Doctor failed.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>OpenClaw Repo Mapping Wizard</CardTitle>
        <CardDescription>
          Connect this workspace to a local repo without manually editing
          mapping JSON.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="oc-mapping-api-key">
              Admin API Key (session-only)
            </Label>
            <Input
              id="oc-mapping-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk_..."
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oc-mapping-repo-path">Local Repo Path</Label>
            <Input
              id="oc-mapping-repo-path"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="/abs/path/to/repo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oc-mapping-alias">Alias (optional)</Label>
            <Input
              id="oc-mapping-alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="repo-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oc-mapping-file">
              Mapping File Override (optional)
            </Label>
            <Input
              id="oc-mapping-file"
              value={mappingFile}
              onChange={(event) => setMappingFile(event.target.value)}
              placeholder="~/.openclaw/kanbanthing-workspaces.json"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={runInspect}
          >
            Inspect Repo
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() => runUpsert(true)}
          >
            Dry Run
          </Button>
          <Button
            type="button"
            disabled={isBusy}
            onClick={() => runUpsert(false)}
          >
            Save Mapping
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={runDoctor}
          >
            Verify
          </Button>
        </div>

        {statusText && (
          <p className="text-sm text-muted-foreground">{statusText}</p>
        )}

        {inspectResult && (
          <div className="space-y-2">
            <Label>Inspect Result</Label>
            <Textarea
              readOnly
              value={JSON.stringify(inspectResult, null, 2)}
              className="min-h-[140px] font-mono text-xs"
            />
          </div>
        )}

        {doctorResult && (
          <div className="space-y-2">
            <Label>Verification Result</Label>
            <Textarea
              readOnly
              value={JSON.stringify(doctorResult, null, 2)}
              className="min-h-[160px] font-mono text-xs"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
