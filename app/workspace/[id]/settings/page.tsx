"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Key, Plus, Trash2, Copy, Check } from "lucide-react";
import { useState } from "react";

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

  const workspace = useQuery(api.workspaces.get, { id: workspaceId });
  const apiKeys = useQuery(api.apiKeys.list, { workspaceId });

  const updateWorkspace = useMutation(api.workspaces.update);
  const createApiKey = useMutation(api.apiKeys.create);
  const deleteApiKey = useMutation(api.apiKeys.remove);

  const [docs, setDocs] = useState<string | null>(null);
  const [isSavingDocs, setIsSavingDocs] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const currentDocs = docs ?? workspace?.docs ?? "";

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

  const handleDeleteKey = async (id: Id<"apiKeys">) => {
    if (confirm("Delete this API key? Any agents using it will lose access.")) {
      await deleteApiKey({ id });
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  if (workspace === undefined || apiKeys === undefined) {
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
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
                Configure workspace docs and API keys
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-4xl space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Workspace Documentation</CardTitle>
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
                <p className="text-foreground">curl -H &quot;X-API-Key: sk_...&quot; /api/workspace/docs</p>
                <p className="mt-2"># List feature docs</p>
                <p className="text-foreground">curl -H &quot;X-API-Key: sk_...&quot; /api/docs</p>
                <p className="mt-2"># Get feature doc</p>
                <p className="text-foreground">curl -H &quot;X-API-Key: sk_...&quot; /api/docs/DOC_ID</p>
                <p className="mt-2"># Create feature doc</p>
                <p className="text-foreground">
                  {"curl -X POST -H \"X-API-Key: sk_...\" -H \"Content-Type: application/json\" -d '{\"title\":\"Subscription feature\",\"content\":\"...\"}' /api/docs"}
                </p>
                <p className="mt-2"># Update feature doc</p>
                <p className="text-foreground">
                  {"curl -X PATCH -H \"X-API-Key: sk_...\" -H \"Content-Type: application/json\" -d '{\"content\":\"...\"}' /api/docs/DOC_ID"}
                </p>
                <p className="mt-2"># Delete feature doc</p>
                <p className="text-foreground">curl -X DELETE -H &quot;X-API-Key: sk_...&quot; /api/docs/DOC_ID</p>
                <p className="mt-2"># List tickets</p>
                <p className="text-foreground">curl -H &quot;X-API-Key: sk_...&quot; /api/tickets</p>
                <p className="mt-2"># List tickets for a doc</p>
                <p className="text-foreground">curl -H &quot;X-API-Key: sk_...&quot; /api/tickets?docId=DOC_ID</p>
                <p className="mt-2"># Claim a ticket</p>
                <p className="text-foreground">curl -X POST -H &quot;X-API-Key: sk_...&quot; /api/tickets/ID/claim</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
