"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Hash } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { generateWorkspacePrefix } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { TagManager } from "@/components/tag-manager";
import { useWorkspaceData } from "@/components/workspace-data-provider";
import { WorkspaceApiKeysCard } from "@/components/workspace-settings/api-keys-card";
import { WorkspaceMembersCard } from "@/components/workspace-settings/members-card";
import { WorkspaceDocsVersionDialog } from "@/components/workspace-settings/docs-version-dialog";
import { OpenClawMappingWizardCard } from "@/components/workspace-settings/openclaw-mapping-wizard-card";

function generateApiKey(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "sk_";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  // crypto.subtle requires a secure context (HTTPS or localhost).
  // Fall back to a dynamic import of Node's crypto for non-secure contexts (e.g. HTTP dev servers).
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const hashBuffer = await subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback: POST to a tiny API endpoint that hashes for us
  const res = await fetch("/api/hash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: key }),
  });
  if (!res.ok) {
    throw new Error(`Hash API failed: ${res.status}`);
  }
  const json = await res.json();
  if (typeof json.hash !== "string") {
    throw new Error("Invalid hash response");
  }
  return json.hash;
}

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const workspaceId = params.id as Id<"workspaces">;
  const { data: session, isPending: isSessionPending } = useSession();
  const userId = session?.user?.id;
  const canQueryWorkspace = Boolean(userId);
  const { workspace } = useWorkspaceData();
  const apiKeys = useQuery(
    api.apiKeys.list,
    canQueryWorkspace ? { workspaceId } : "skip",
  );
  const docsVersions = useQuery(
    api.workspaces.listDocsVersions,
    canQueryWorkspace ? { workspaceId } : "skip",
  );
  const members = useQuery(
    api.workspaceMembers.listByWorkspace,
    canQueryWorkspace ? { workspaceId } : "skip",
  );
  const currentMembership = useQuery(
    api.workspaceMembers.getMembership,
    userId ? { workspaceId, betterAuthUserId: userId } : "skip",
  );
  const memberUserIds = useMemo(
    () => members?.map((m) => m.betterAuthUserId) ?? [],
    [members],
  );
  const userProfiles = useQuery(
    api.userProfiles.getByAuthIds,
    memberUserIds.length > 0 ? { betterAuthUserIds: memberUserIds } : "skip",
  );
  const profileMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof userProfiles>[number]>();
    userProfiles?.forEach((p) => map.set(p.betterAuthUserId, p));
    return map;
  }, [userProfiles]);
  const formatActorName = (
    actorType: string,
    actorId: string,
    actorDisplayName?: string | null,
  ) => {
    if (actorType === "user") {
      const profile = profileMap.get(actorId);
      return profile?.name || profile?.email || actorId;
    }
    return actorDisplayName || actorId;
  };

  const updateWorkspace = useMutation(api.workspaces.update);
  const createApiKey = useMutation(api.apiKeys.create);
  const deleteApiKey = useMutation(api.apiKeys.remove);
  const updateApiKeyRole = useMutation(api.apiKeys.updateRole);
  const resetWorkspaceTickets = useMutation(
    api.workspaces.resetWorkspaceTickets,
  );
  const addMembersByEmails = useMutation(api.workspaceMembers.addByEmails);
  const removeMember = useMutation(api.workspaceMembers.remove);
  const updateMemberRole = useMutation(api.workspaceMembers.updateRole);
  const syncProfiles = useMutation(api.userProfiles.syncFromAuthIds);

  const [docs, setDocs] = useState<string | null>(null);
  const [isSavingDocs, setIsSavingDocs] = useState(false);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [isSavingPrefix, setIsSavingPrefix] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRole, setNewKeyRole] = useState<"agent" | "admin">("agent");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [updatingApiKeyId, setUpdatingApiKeyId] =
    useState<Id<"apiKeys"> | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [memberEmails, setMemberEmails] = useState("");
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [addMemberResult, setAddMemberResult] = useState<{
    added: string[];
    alreadyMember: string[];
    notFound: string[];
  } | null>(null);
  const [selectedDocsVersion, setSelectedDocsVersion] =
    useState<Doc<"workspaceDocsVersions"> | null>(null);
  const [isDocsDialogOpen, setIsDocsDialogOpen] = useState(false);

  const canManageMembers =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canManageApiKeys =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const requestedProfileIds = useRef(new Set<string>());

  useEffect(() => {
    if (!members || !members.length) return;
    const missing = members
      .map((member) => member.betterAuthUserId)
      .filter(
        (id) => !profileMap.has(id) && !requestedProfileIds.current.has(id),
      );

    if (missing.length === 0) return;

    missing.forEach((id) => requestedProfileIds.current.add(id));
    syncProfiles({ betterAuthUserIds: missing }).catch(console.error);
  }, [members, profileMap, syncProfiles]);

  const currentDocs = docs ?? workspace?.docs ?? "";
  const defaultPrefix = workspace
    ? generateWorkspacePrefix(workspace.name)
    : "";
  const currentPrefix = prefix ?? workspace?.prefix ?? defaultPrefix;
  const normalizedPrefix = currentPrefix
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  const prefixIsValid = normalizedPrefix.length >= 2;

  const handleSaveDocs = async () => {
    setIsSavingDocs(true);
    try {
      await updateWorkspace({ id: workspaceId, docs: currentDocs });
      setDocs(null);
    } finally {
      setIsSavingDocs(false);
    }
  };

  const handleCreateKey = async () => {
    if (!canManageApiKeys) {
      alert("Only workspace owners and admins can generate API keys.");
      return;
    }
    if (!newKeyName.trim()) return;

    const key = generateApiKey();
    const keyHash = await hashKey(key);

    await createApiKey({
      workspaceId,
      keyHash,
      name: newKeyName.trim(),
      role: newKeyRole,
    });

    setGeneratedKey(key);
    setNewKeyName("");
    setNewKeyRole("agent");
  };

  const handleResetTickets = async () => {
    if (
      !confirm("Delete all issues in this workspace? This cannot be undone.")
    ) {
      return;
    }
    setIsResetting(true);
    try {
      await resetWorkspaceTickets({ id: workspaceId });
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteKey = async (id: Id<"apiKeys">) => {
    if (!canManageApiKeys) {
      alert("Only workspace owners and admins can delete API keys.");
      return;
    }
    if (confirm("Delete this API key? Any agents using it will lose access.")) {
      await deleteApiKey({ id });
    }
  };

  const handleChangeApiKeyRole = async (
    id: Id<"apiKeys">,
    role: "agent" | "admin",
  ) => {
    if (!canManageApiKeys) {
      alert("Only workspace owners and admins can update API key roles.");
      return;
    }

    setUpdatingApiKeyId(id);
    try {
      await updateApiKeyRole({ id, role });
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to update API key role",
      );
    } finally {
      setUpdatingApiKeyId(null);
    }
  };

  const handleAddMembers = async () => {
    const emails = memberEmails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;

    setIsAddingMembers(true);
    setAddMemberResult(null);
    try {
      const result = await addMembersByEmails({
        workspaceId,
        emails,
      });
      setAddMemberResult(result);
      if (result.added.length > 0) {
        setMemberEmails("");
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to add members");
    } finally {
      setIsAddingMembers(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (confirm("Remove this member from the workspace?")) {
      try {
        await removeMember({ workspaceId, betterAuthUserId: memberUserId });
      } catch (error) {
        alert(
          error instanceof Error ? error.message : "Failed to remove member",
        );
      }
    }
  };

  const handleChangeRole = async (
    memberUserId: string,
    newRole: "owner" | "admin" | "member",
  ) => {
    try {
      await updateMemberRole({
        workspaceId,
        betterAuthUserId: memberUserId,
        role: newRole,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to change role");
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleSavePrefix = async () => {
    if (!prefixIsValid) return;
    setIsSavingPrefix(true);
    try {
      await updateWorkspace({ id: workspaceId, prefix: normalizedPrefix });
      setPrefix(null);
    } finally {
      setIsSavingPrefix(false);
    }
  };

  if (isSessionPending) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="kb-label">Loading workspace settings...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-center">
        <div>
          <h1 className="text-2xl font-bold mb-4">Access required</h1>
          <Link href="/login">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (
    workspace === undefined ||
    apiKeys === undefined ||
    docsVersions === undefined
  ) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="kb-label">Loading workspace settings...</div>
      </div>
    );
  }

  if (workspace === null) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-center">
        <div>
          <h1 className="text-2xl font-bold mb-4">Workspace not found</h1>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header className="kb-header border-b-2 border-primary/45 sticky top-0 z-10">
        <div className="pl-12 pr-4 py-4 md:px-6">
          <div className="flex items-center gap-4">
            <Link
              href={`/workspace/${workspaceId}`}
              className="hidden md:inline-flex"
            >
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="kb-label">Workspace Administration</div>
              <h1 className="text-2xl font-semibold tracking-[0.04em]">
                <Link
                  href={`/workspace/${workspaceId}`}
                  className="hover:text-primary transition-colors"
                >
                  {workspace.name}
                </Link>{" "}
                Settings
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure prefix, project docs, and API keys
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="w-5 h-5" />
              Workspace Prefix
            </CardTitle>
            <CardDescription>
              Used to generate issue identifiers like{" "}
              {normalizedPrefix || "PRJ"}-12.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="kb-label mb-1">Workspace ID</div>
                  <code className="text-xs text-muted-foreground break-all">
                    {workspaceId}
                  </code>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(String(workspaceId), "workspace-id")
                  }
                >
                  {copiedKeyId === "workspace-id" ? "Copied" : "Copy ID"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this when mapping KanbanThing workspaces to local
                directories in OpenClaw or other integrations.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-prefix">Prefix</Label>
              <Input
                id="workspace-prefix"
                value={normalizedPrefix}
                onChange={(event) => {
                  const value = event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, "");
                  setPrefix(value);
                }}
                placeholder={defaultPrefix}
                maxLength={4}
              />
              {!prefixIsValid && (
                <p className="text-xs text-muted-foreground">
                  Use at least two letters (A-Z).
                </p>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Example IDs: {normalizedPrefix || "PRJ"}-42
            </div>
            <div className="flex justify-end gap-2">
              {prefix !== null && (
                <Button variant="outline" onClick={() => setPrefix(null)}>
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleSavePrefix}
                disabled={!prefixIsValid || prefix === null || isSavingPrefix}
              >
                {isSavingPrefix ? "Saving..." : "Save Prefix"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <OpenClawMappingWizardCard workspaceId={String(workspaceId)} />

        <Card>
          <CardHeader>
            <CardTitle>Project Docs</CardTitle>
            <CardDescription>
              Add project context, conventions, and useful links for agents
              working in this workspace. This is returned by the GET
              /api/workspace/docs endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="# Project Overview&#10;&#10;## Tech Stack&#10;- ...&#10;&#10;## Conventions&#10;- ...&#10;&#10;## Important Files&#10;- ..."
              value={currentDocs}
              onChange={(e) => setDocs(e.target.value)}
              rows={16}
              className="font-mono text-sm"
            />
            {currentDocs.trim() && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <Markdown
                  content={currentDocs}
                  className="rounded-md border bg-muted/30 p-3 max-h-64 overflow-auto"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              {docs !== null && (
                <Button variant="outline" onClick={() => setDocs(null)}>
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleSaveDocs}
                disabled={docs === null || isSavingDocs}
              >
                {isSavingDocs ? "Saving..." : "Save Documentation"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Docs History</CardTitle>
            <CardDescription>
              Previous versions of your workspace documentation (view-only).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {docsVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No history yet.</p>
            ) : (
              <div className="space-y-3">
                {docsVersions.map((version) => (
                  <div
                    key={version._id}
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(version.createdAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatActorName(
                          version.actorType,
                          version.actorId,
                          version.actorDisplayName,
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedDocsVersion(version);
                        setIsDocsDialogOpen(true);
                      }}
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <WorkspaceApiKeysCard
          apiKeys={apiKeys}
          canManageApiKeys={canManageApiKeys}
          generatedKey={generatedKey}
          copiedKeyId={copiedKeyId}
          newKeyName={newKeyName}
          newKeyRole={newKeyRole}
          updatingApiKeyId={updatingApiKeyId}
          onNewKeyNameChange={setNewKeyName}
          onNewKeyRoleChange={setNewKeyRole}
          onCreateKey={handleCreateKey}
          onDeleteKey={handleDeleteKey}
          onChangeApiKeyRole={handleChangeApiKeyRole}
          onCopyToClipboard={copyToClipboard}
          onDismissGeneratedKey={() => setGeneratedKey(null)}
        />

        {canManageMembers && (
          <WorkspaceMembersCard
            members={members}
            profileMap={profileMap}
            currentMembershipRole={currentMembership?.role}
            currentUserId={userId}
            memberEmails={memberEmails}
            isAddingMembers={isAddingMembers}
            addMemberResult={addMemberResult}
            onMemberEmailsChange={(value) => {
              setMemberEmails(value);
              setAddMemberResult(null);
            }}
            onAddMembers={handleAddMembers}
            onChangeRole={handleChangeRole}
            onRemoveMember={handleRemoveMember}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              Tags
            </CardTitle>
            <CardDescription>
              Create custom tags to categorize tickets. Tags are workspace-wide
              and can be assigned to any ticket.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TagManager workspaceId={workspaceId} />
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Resetting clears all issues in this workspace. This cannot be
              undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="font-medium">Delete all issues</div>
              <p className="text-sm text-muted-foreground">
                Use this to start fresh while keeping the workspace and API
                keys.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleResetTickets}
              disabled={isResetting}
            >
              {isResetting ? "Resetting..." : "Delete issues"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <WorkspaceDocsVersionDialog
        open={isDocsDialogOpen}
        selectedVersion={selectedDocsVersion}
        onOpenChange={(open) => {
          setIsDocsDialogOpen(open);
          if (!open) setSelectedDocsVersion(null);
        }}
      />
    </div>
  );
}
