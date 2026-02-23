"use client";

import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Check, Copy, Key, Plus, Trash2 } from "lucide-react";

type ApiKeyRole = "agent" | "admin";

type WorkspaceApiKeysCardProps = {
  apiKeys: Doc<"apiKeys">[];
  canManageApiKeys: boolean;
  generatedKey: string | null;
  copiedKeyId: string | null;
  newKeyName: string;
  newKeyRole: ApiKeyRole;
  updatingApiKeyId: Id<"apiKeys"> | null;
  onNewKeyNameChange: (value: string) => void;
  onNewKeyRoleChange: (role: ApiKeyRole) => void;
  onCreateKey: () => void | Promise<void>;
  onDeleteKey: (id: Id<"apiKeys">) => void | Promise<void>;
  onChangeApiKeyRole: (id: Id<"apiKeys">, role: ApiKeyRole) => void | Promise<void>;
  onCopyToClipboard: (text: string, id: string) => void | Promise<void>;
  onDismissGeneratedKey: () => void;
};

export function WorkspaceApiKeysCard({
  apiKeys,
  canManageApiKeys,
  generatedKey,
  copiedKeyId,
  newKeyName,
  newKeyRole,
  updatingApiKeyId,
  onNewKeyNameChange,
  onNewKeyRoleChange,
  onCreateKey,
  onDeleteKey,
  onChangeApiKeyRole,
  onCopyToClipboard,
  onDismissGeneratedKey,
}: WorkspaceApiKeysCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          API Keys
        </CardTitle>
        <CardDescription>
          Generate API keys for LLM agents to access this workspace via the REST API. Keys are scoped
          to this workspace only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {generatedKey && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-primary">New API Key Generated</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopyToClipboard(generatedKey, "new")}
              >
                {copiedKeyId === "new" ? (
                  <Check className="mr-1 h-4 w-4" />
                ) : (
                  <Copy className="mr-1 h-4 w-4" />
                )}
                Copy
              </Button>
            </div>
            <code className="block break-all rounded bg-background p-2 text-sm font-mono">
              {generatedKey}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Copy this key now. It won&apos;t be shown again.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onDismissGeneratedKey}>
              Done
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Key name (e.g., 'Claude Agent')"
            value={newKeyName}
            onChange={(event) => onNewKeyNameChange(event.target.value)}
            disabled={!canManageApiKeys}
          />
          <select
            className="h-10 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm"
            value={newKeyRole}
            onChange={(event) => onNewKeyRoleChange(event.target.value as ApiKeyRole)}
            disabled={!canManageApiKeys}
          >
            <option value="agent">Agent key</option>
            <option value="admin">Admin key</option>
          </select>
          <Button onClick={onCreateKey} disabled={!canManageApiKeys || !newKeyName.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            Generate Key
          </Button>
        </div>

        {!canManageApiKeys && (
          <p className="text-sm text-muted-foreground">
            You have read-only access to API keys. Ask an owner or admin to manage keys.
          </p>
        )}

        {apiKeys.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label>Existing Keys</Label>
              {apiKeys.map((key) => (
                <div key={key._id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{key.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">
                      Role: {key.role ?? "admin"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageApiKeys && (
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={key.role ?? "admin"}
                        onChange={(event) =>
                          onChangeApiKeyRole(key._id, event.target.value as ApiKeyRole)
                        }
                        disabled={updatingApiKeyId === key._id}
                      >
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                    {canManageApiKeys && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onDeleteKey(key._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-2">
          <Label>API Usage</Label>
          <div className="space-y-1 rounded-lg bg-muted p-3 font-mono text-sm text-muted-foreground">
            <p># Get workspace docs</p>
            <p className="text-foreground">{'curl -H "X-API-Key: sk_..." /api/workspace/docs'}</p>
            <p className="mt-2"># Update workspace docs</p>
            <p className="text-foreground">
              {
                'curl -X PATCH -H "X-API-Key: sk_..." -H "Content-Type: application/json" -d \'{"docs":"..."}\' /api/workspace/docs'
              }
            </p>
            <p className="mt-2"># Docs history</p>
            <p className="text-foreground">
              {'curl -H "X-API-Key: sk_..." /api/workspace/docs/history'}
            </p>
            <p className="mt-2"># List issues</p>
            <p className="text-foreground">{'curl -H "X-API-Key: sk_..." /api/tickets'}</p>
            <p className="mt-2"># List child issues</p>
            <p className="text-foreground">
              {'curl -H "X-API-Key: sk_..." /api/tickets?parentId=ISSUE_ID'}
            </p>
            <p className="mt-2"># Create issue</p>
            <p className="text-foreground">
              {
                'curl -X POST -H "X-API-Key: sk_..." -H "Content-Type: application/json" -d \'{"title":"New issue","description":"..."}\' /api/tickets'
              }
            </p>
            <p className="mt-2"># Update issue</p>
            <p className="text-foreground">
              {
                'curl -X PATCH -H "X-API-Key: sk_..." -H "Content-Type: application/json" -d \'{"title":"Updated"}\' /api/tickets/ISSUE_ID'
              }
            </p>
            <p className="mt-2"># Change status</p>
            <p className="text-foreground">
              {
                'curl -X POST -H "X-API-Key: sk_..." -H "Content-Type: application/json" -d \'{"status":"done"}\' /api/tickets/ISSUE_ID/status'
              }
            </p>
            <p className="text-foreground">
              {
                'curl -X POST -H "X-API-Key: sk_..." -H "Content-Type: application/json" -d \'{"status":"unclaimed","reason":"duplicate ticket"}\' /api/tickets/ISSUE_ID/status'
              }
            </p>
            <p className="mt-2"># Claim an issue</p>
            <p className="text-foreground">{'curl -X POST -H "X-API-Key: sk_..." /api/tickets/ISSUE_ID/claim'}</p>
            <p className="mt-2"># Assign / unassign</p>
            <p className="text-foreground">
              {
                'curl -X POST -H "X-API-Key: sk_..." -H "X-Agent-Session-Id: agent-A" -H "Content-Type: application/json" -d \'{}\' /api/tickets/ISSUE_ID/assign'
              }
            </p>
            <p className="text-foreground">
              {"# OpenClaw alias: use X-OpenClaw-Session-Id instead of X-Agent-Session-Id"}
            </p>
            <p className="text-foreground">
              {'curl -X POST -H "X-API-Key: sk_..." /api/tickets/ISSUE_ID/unassign'}
            </p>
            <p className="mt-2"># Comment + activity</p>
            <p className="text-foreground">
              {
                'curl -X POST -H "X-API-Key: sk_..." -H "Content-Type: application/json" -d \'{"body":"Update..."}\' /api/tickets/ISSUE_ID/comments'
              }
            </p>
            <p className="text-foreground">
              {'curl -H "X-API-Key: sk_..." /api/tickets/ISSUE_ID/activity'}
            </p>
            <p className="mt-2"># API key lifecycle (admin key only)</p>
            <p className="text-foreground">{'curl -H "X-API-Key: sk_admin..." /api/api-keys'}</p>
            <p className="text-foreground">
              {
                'curl -X POST -H "X-API-Key: sk_admin..." -H "Content-Type: application/json" -d \'{"name":"Harness B","role":"agent"}\' /api/api-keys'
              }
            </p>
            <p className="text-foreground">
              {'curl -X DELETE -H "X-API-Key: sk_admin..." /api/api-keys/API_KEY_ID'}
            </p>
            <p className="text-foreground">
              {
                'curl -X PATCH -H "X-API-Key: sk_admin..." -H "Content-Type: application/json" -d \'{"role":"admin"}\' /api/api-keys/API_KEY_ID'
              }
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
