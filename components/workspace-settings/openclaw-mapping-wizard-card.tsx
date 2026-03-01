"use client";

import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { X } from "lucide-react";
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
  const instances = useQuery(api.openclawInstances.list);
  const inspectRemote = useAction(
    api.openclawInstancesActions.workspaceMappingInspect,
  );
  const upsertRemote = useAction(api.openclawInstancesActions.workspaceMappingUpsert);
  const doctorRemote = useAction(api.openclawInstancesActions.workspaceMappingDoctor);

  const [instanceId, setInstanceId] = useState<Id<"openclawInstances"> | "">(
    "",
  );
  const [repoPath, setRepoPath] = useState("");
  const [alias, setAlias] = useState("");
  const [mappingFile, setMappingFile] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [inspectResult, setInspectResult] = useState<InspectResponse | null>(
    null,
  );
  const [doctorResult, setDoctorResult] = useState<DoctorResponse | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const requireInputs = () => {
    if (!instanceId) {
      setStatusText("OpenClaw instance is required.");
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
    const selectedInstanceId = instanceId as Id<"openclawInstances">;
    setIsBusy(true);
    setStatusText(null);
    try {
      const response = await inspectRemote({
        instanceId: selectedInstanceId,
        repoPath: repoPath.trim(),
        workspaceId,
        ...(mappingFile.trim() ? { mappingFile: mappingFile.trim() } : {}),
      });
      if (!response.ok) {
        setStatusText(response.message ?? "Inspect failed.");
        return;
      }
      setInspectResult((response.data as InspectResponse | undefined) ?? null);
      setStatusText(`Inspect succeeded on ${response.instanceName}.`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Inspect failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const runUpsert = async (dryRun: boolean) => {
    if (!requireInputs()) return;
    const selectedInstanceId = instanceId as Id<"openclawInstances">;
    setIsBusy(true);
    setStatusText(null);
    try {
      const response = await upsertRemote({
        instanceId: selectedInstanceId,
        repoPath: repoPath.trim(),
        workspaceId,
        dryRun,
        applySafeFixes: true,
        ...(alias.trim() ? { alias: alias.trim() } : {}),
        ...(mappingFile.trim() ? { mappingFile: mappingFile.trim() } : {}),
      });
      if (!response.ok) {
        setStatusText(response.message ?? "Upsert failed.");
        return;
      }
      const body = (response.data ?? null) as
        | {
            doctor?: DoctorResponse;
            alias?: string;
          }
        | null;
      if (body?.doctor) setDoctorResult(body.doctor);
      setStatusText(
        dryRun
          ? `Dry-run passed on ${response.instanceName}. Review result then click Save Mapping.`
          : `Mapping saved on ${response.instanceName}${body?.alias ? ` (alias: ${body.alias})` : ""}.`,
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Upsert failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const runDoctor = async () => {
    if (!instanceId) {
      setStatusText("OpenClaw instance is required.");
      return;
    }
    const selectedInstanceId = instanceId as Id<"openclawInstances">;
    setIsBusy(true);
    setStatusText(null);
    try {
      const response = await doctorRemote({
        instanceId: selectedInstanceId,
        workspaceId,
        ...(mappingFile.trim() ? { mappingFile: mappingFile.trim() } : {}),
      });
      if (!response.ok) {
        setStatusText(response.message ?? "Doctor failed.");
        return;
      }
      const body = (response.data as DoctorResponse | null) ?? null;
      if (!body) {
        setStatusText("Doctor failed.");
        return;
      }
      setDoctorResult(body);
      setStatusText(
        body.ok
          ? `Verification passed on ${response.instanceName}.`
          : `Verification found issues on ${response.instanceName}.`,
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
          Select an OpenClaw instance and connect this workspace to a local repo
          without manually editing mapping JSON.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="oc-mapping-instance">OpenClaw Instance</Label>
            <select
              id="oc-mapping-instance"
              value={instanceId}
              onChange={(event) =>
                setInstanceId(event.target.value as Id<"openclawInstances"> | "")
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select instance...</option>
              {(instances ?? []).map((instance) => (
                <option key={instance._id} value={instance._id}>
                  {instance.name}
                </option>
              ))}
            </select>
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

        {statusText ? (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            {statusText}
          </div>
        ) : null}

        {inspectResult ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Inspect Result</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setInspectResult(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              readOnly
              className="min-h-[130px] font-mono text-xs"
              value={JSON.stringify(inspectResult, null, 2)}
            />
          </div>
        ) : null}

        {doctorResult ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Verify Result</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setDoctorResult(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              readOnly
              className="min-h-[160px] font-mono text-xs"
              value={JSON.stringify(doctorResult, null, 2)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
