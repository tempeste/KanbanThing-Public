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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Key, Plus, Trash2, Copy, Check, Hash, Users, Crown, Shield, User, AlertCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { generateWorkspacePrefix } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "sk_";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const workspaceId = params.id as Id<"workspaces">;
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const workspace = useQuery(api.workspaces.get, { id: workspaceId });
  const apiKeys = useQuery(api.apiKeys.list, { workspaceId });
  const docsVersions = useQuery(api.workspaces.listDocsVersions, { workspaceId });
  const members = useQuery(api.workspaceMembers.listByWorkspace, { workspaceId });
  const currentMembership = useQuery(
    api.workspaceMembers.getMembership,
    userId ? { workspaceId, betterAuthUserId: userId } : "skip"
  );
  const memberUserIds = useMemo(
    () => members?.map((m) => m.betterAuthUserId) ?? [],
    [members]
  );
  const userProfiles = useQuery(
    api.userProfiles.getByAuthIds,
    memberUserIds.length > 0 ? { betterAuthUserIds: memberUserIds } : "skip"
  );
  const profileMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof userProfiles>[number]>();
    userProfiles?.forEach((p) => map.set(p.betterAuthUserId, p));
    return map;
  }, [userProfiles]);
  const formatActorName = (
    actorType: string,
    actorId: string,
    actorDisplayName?: string | null
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
  const resetWorkspaceTickets = useMutation(api.workspaces.resetWorkspaceTickets);
  const addMembersByEmails = useMutation(api.workspaceMembers.addByEmails);
  const removeMember = useMutation(api.workspaceMembers.remove);
  const updateMemberRole = useMutation(api.workspaceMembers.updateRole);
  const syncProfiles = useMutation(api.userProfiles.syncFromAuthIds);

  const [docs, setDocs] = useState<string | null>(null);
  const [isSavingDocs, setIsSavingDocs] = useState(false);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [isSavingPrefix, setIsSavingPrefix] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [memberEmails, setMemberEmails] = useState("");
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [addMemberResult, setAddMemberResult] = useState<{
    added: string[];
    alreadyMember: string[];
    notFound: string[];
  } | null>(null);
  const [selectedDocsVersion, setSelectedDocsVersion] = useState<
    Doc<"workspaceDocsVersions"> | null
  >(null);
  const [isDocsDialogOpen, setIsDocsDialogOpen] = useState(false);

  const canManageMembers = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const requestedProfileIds = useRef(new Set<string>());

  useEffect(() => {
    if (!members || !members.length) return;
    const missing = members
      .map((member) => member.betterAuthUserId)
      .filter((id) => !profileMap.has(id) && !requestedProfileIds.current.has(id));

    if (missing.length === 0) return;

    missing.forEach((id) => requestedProfileIds.current.add(id));
    syncProfiles({ betterAuthUserIds: missing }).catch(console.error);
  }, [members, profileMap, syncProfiles]);

  const currentDocs = docs ?? workspace?.docs ?? "";
  const defaultPrefix = workspace ? generateWorkspacePrefix(workspace.name) : "";
  const currentPrefix = prefix ?? workspace?.prefix ?? defaultPrefix;
  const normalizedPrefix = currentPrefix.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
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
    if (!newKeyName.trim()) return;

    const key = generateApiKey();
    const keyHash = await hashKey(key);

    await createApiKey({
      workspaceId,
      keyHash,
      name: newKeyName.trim(),
    });

    setGeneratedKey(key);
    setNewKeyName("");
  };

  const handleResetTickets = async () => {
    if (!confirm("Delete all issues in this workspace? This cannot be undone.")) {
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
    if (confirm("Delete this API key? Any agents using it will lose access.")) {
      await deleteApiKey({ id });
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
        alert(error instanceof Error ? error.message : "Failed to remove member");
      }
    }
  };

  const handleChangeRole = async (memberUserId: string, newRole: "owner" | "admin" | "member") => {
    try {
      await updateMemberRole({ workspaceId, betterAuthUserId: memberUserId, role: newRole });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to change role");
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner": return <Crown className="w-4 h-4 text-amber-500" />;
      case "admin": return <Shield className="w-4 h-4 text-blue-500" />;
      default: return <User className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
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

  if (workspace === undefined || apiKeys === undefined || docsVersions === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (workspace === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Workspace not found</h1>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/workspace/${workspaceId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{workspace.name} Settings</h1>
              <p className="text-sm text-muted-foreground">
                Configure prefix, project docs, and API keys
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-4xl space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="w-5 h-5" />
              Workspace Prefix
            </CardTitle>
            <CardDescription>
              Used to generate issue identifiers like {normalizedPrefix || "PRJ"}-12.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-prefix">Prefix</Label>
              <Input
                id="workspace-prefix"
                value={normalizedPrefix}
                onChange={(event) => {
                  const value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "");
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

        <Card>
          <CardHeader>
            <CardTitle>Project Docs</CardTitle>
            <CardDescription>
              Add project context, conventions, and useful links for agents working in this workspace.
              This is returned by the GET /api/workspace/docs endpoint.
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
                          version.actorDisplayName
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Generate API keys for LLM agents to access this workspace via the REST API.
              Keys are scoped to this workspace only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {generatedKey && (
              <div className="p-4 border rounded-lg bg-primary/5 border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-primary">New API Key Generated</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(generatedKey, "new")}
                  >
                    {copiedKeyId === "new" ? (
                      <Check className="w-4 h-4 mr-1" />
                    ) : (
                      <Copy className="w-4 h-4 mr-1" />
                    )}
                    Copy
                  </Button>
                </div>
                <code className="block p-2 bg-background rounded text-sm font-mono break-all">
                  {generatedKey}
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Copy this key now. It won&apos;t be shown again.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setGeneratedKey(null)}
                >
                  Done
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="Key name (e.g., 'Claude Agent')"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <Button onClick={handleCreateKey} disabled={!newKeyName.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                Generate Key
              </Button>
            </div>

            {apiKeys.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label>Existing Keys</Label>
                  {apiKeys.map((key) => (
                    <div
                      key={key._id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{key.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(key.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteKey(key._id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-2">
              <Label>API Usage</Label>
              <div className="text-sm text-muted-foreground space-y-1 font-mono bg-muted p-3 rounded-lg">
                <p># Get workspace docs</p>
                <p className="text-foreground">
                  {"curl -H \"X-API-Key: sk_...\" /api/workspace/docs"}
                </p>
                <p className="mt-2"># Update workspace docs</p>
                <p className="text-foreground">
                  {"curl -X PATCH -H \"X-API-Key: sk_...\" -H \"Content-Type: application/json\" -d '{\"docs\":\"...\"}' /api/workspace/docs"}
                </p>
                <p className="mt-2"># Docs history</p>
                <p className="text-foreground">
                  {"curl -H \"X-API-Key: sk_...\" /api/workspace/docs/history"}
                </p>
                <p className="mt-2"># List issues</p>
                <p className="text-foreground">
                  {"curl -H \"X-API-Key: sk_...\" /api/tickets"}
                </p>
                <p className="mt-2"># List child issues</p>
                <p className="text-foreground">
                  {"curl -H \"X-API-Key: sk_...\" /api/tickets?parentId=ISSUE_ID"}
                </p>
                <p className="mt-2"># Create issue</p>
                <p className="text-foreground">
                  {"curl -X POST -H \"X-API-Key: sk_...\" -H \"Content-Type: application/json\" -d '{\"title\":\"New issue\",\"description\":\"...\"}' /api/tickets"}
                </p>
                <p className="mt-2"># Update issue</p>
                <p className="text-foreground">
                  {"curl -X PATCH -H \"X-API-Key: sk_...\" -H \"Content-Type: application/json\" -d '{\"title\":\"Updated\"}' /api/tickets/ISSUE_ID"}
                </p>
                <p className="mt-2"># Change status</p>
                <p className="text-foreground">
                  {"curl -X POST -H \"X-API-Key: sk_...\" -H \"Content-Type: application/json\" -d '{\"status\":\"done\"}' /api/tickets/ISSUE_ID/status"}
                </p>
                <p className="mt-2"># Claim an issue</p>
                <p className="text-foreground">
                  {"curl -X POST -H \"X-API-Key: sk_...\" /api/tickets/ISSUE_ID/claim"}
                </p>
                <p className="mt-2"># Assign / unassign</p>
                <p className="text-foreground">
                  {"curl -X POST -H \"X-API-Key: sk_...\" -H \"Content-Type: application/json\" -d '{\"ownerId\":\"...\",\"ownerType\":\"agent\"}' /api/tickets/ISSUE_ID/assign"}
                </p>
                <p className="text-foreground">
                  {"curl -X POST -H \"X-API-Key: sk_...\" /api/tickets/ISSUE_ID/unassign"}
                </p>
                <p className="mt-2"># Comment + activity</p>
                <p className="text-foreground">
                  {"curl -X POST -H \"X-API-Key: sk_...\" -H \"Content-Type: application/json\" -d '{\"body\":\"Update...\"}' /api/tickets/ISSUE_ID/comments"}
                </p>
                <p className="text-foreground">
                  {"curl -H \"X-API-Key: sk_...\" /api/tickets/ISSUE_ID/activity"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {canManageMembers && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Members
              </CardTitle>
              <CardDescription>
                Manage who has access to this workspace. Owners have full control, admins can manage members, and members can view and edit tickets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="member-emails">Add members by email</Label>
                <Textarea
                  id="member-emails"
                  placeholder="Enter email addresses (comma or newline separated)"
                  value={memberEmails}
                  onChange={(e) => {
                    setMemberEmails(e.target.value);
                    setAddMemberResult(null);
                  }}
                  rows={3}
                  className="font-mono text-sm"
                />
                <Button
                  onClick={handleAddMembers}
                  disabled={!memberEmails.trim() || isAddingMembers}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {isAddingMembers ? "Adding..." : "Add Members"}
                </Button>
              </div>

              {addMemberResult && (
                <div className="space-y-2 text-sm">
                  {addMemberResult.added.length > 0 && (
                    <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-md text-green-700 dark:text-green-400">
                      <strong>Added:</strong> {addMemberResult.added.join(", ")}
                    </div>
                  )}
                  {addMemberResult.alreadyMember.length > 0 && (
                    <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-700 dark:text-yellow-400">
                      <strong>Already members:</strong> {addMemberResult.alreadyMember.join(", ")}
                    </div>
                  )}
                  {addMemberResult.notFound.length > 0 && (
                    <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-md text-red-700 dark:text-red-400 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong>Not found:</strong> {addMemberResult.notFound.join(", ")}
                        <p className="text-xs mt-1 opacity-80">
                          Users must log in at least once before they can be added.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {members && members.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label>Current Members</Label>
                    {members.map((member) => {
                      const profile = profileMap.get(member.betterAuthUserId);
                      const displayName = profile?.name || profile?.email || member.betterAuthUserId;
                      const initials = (profile?.name?.[0] || profile?.email?.[0] || "?").toUpperCase();

                      return (
                        <div
                          key={member._id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={profile?.image} alt={displayName} />
                              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div className="flex items-center gap-2">
                              {getRoleIcon(member.role)}
                              <div>
                                <p className="font-medium text-sm">{displayName}</p>
                                {profile?.name && profile?.email && (
                                  <p className="text-xs text-muted-foreground">{profile.email}</p>
                                )}
                                <p className="text-xs text-muted-foreground capitalize">
                                  {member.role}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {currentMembership?.role === "owner" && member.betterAuthUserId !== userId && (
                              <select
                                className="h-8 px-2 text-sm border rounded-md bg-background"
                                value={member.role}
                                onChange={(e) => handleChangeRole(member.betterAuthUserId, e.target.value as "owner" | "admin" | "member")}
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                                <option value="owner">Owner</option>
                              </select>
                            )}
                            {member.betterAuthUserId !== userId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveMember(member.betterAuthUserId)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

            </CardContent>
          </Card>
        )}

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Resetting clears all issues in this workspace. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="font-medium">Delete all issues</div>
              <p className="text-sm text-muted-foreground">
                Use this to start fresh while keeping the workspace and API keys.
              </p>
            </div>
            <Button variant="destructive" onClick={handleResetTickets} disabled={isResetting}>
              {isResetting ? "Resetting..." : "Delete issues"}
            </Button>
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={isDocsDialogOpen}
        onOpenChange={(open) => {
          setIsDocsDialogOpen(open);
          if (!open) setSelectedDocsVersion(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Docs Version</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border bg-background/60 p-4">
            {selectedDocsVersion ? (
              selectedDocsVersion.docs.trim() ? (
                <Markdown content={selectedDocsVersion.docs} className="prose-lg" />
              ) : (
                <p className="text-sm text-muted-foreground">No content.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">No version selected.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
