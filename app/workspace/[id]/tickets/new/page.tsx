"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Plus } from "lucide-react";
import { formatTicketNumber, generateWorkspacePrefix } from "@/lib/utils";

export default function NewTicketPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = params.id as Id<"workspaces">;
  const parentFromQuery = searchParams.get("parentId");

  const workspace = useQuery(api.workspaces.get, { id: workspaceId });
  const tickets = useQuery(api.tickets.list, { workspaceId });

  const createTicket = useMutation(api.tickets.create);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<Id<"tickets"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync parentId from query param during render
  const [syncedParentQuery, setSyncedParentQuery] = useState<string | null>(null);
  if (parentFromQuery && tickets && parentFromQuery !== syncedParentQuery) {
    setSyncedParentQuery(parentFromQuery);
    const match = tickets.find((ticket) => ticket._id === parentFromQuery);
    if (match) {
      setParentId(match._id);
    }
  }

  const workspacePrefix = useMemo(() => {
    if (!workspace) return "";
    return workspace.prefix ?? generateWorkspacePrefix(workspace.name);
  }, [workspace]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const id = await createTicket({
        workspaceId,
        title: title.trim(),
        description: description.trim(),
        parentId: parentId ?? null,
      });
      router.push(`/workspace/${workspaceId}/tickets/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (workspace === undefined || tickets === undefined) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="kb-label">Loading ticket form...</div>
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
          <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/workspace/${workspaceId}`}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <div className="kb-label">{workspace.name}</div>
                <h1 className="text-2xl font-semibold tracking-[0.04em]">Create New Issue</h1>
              </div>
            </div>
            <Button onClick={handleCreate} disabled={!title.trim() || isSaving}>
              <Plus className="h-4 w-4" />
              {isSaving ? "Creating..." : "Create Issue"}
            </Button>
          </div>
        </header>

        <div className="p-4 md:p-6">
          <Card className="space-y-5 p-6">
            <div className="space-y-2">
              <Label htmlFor="title" className="kb-label">
                Title
              </Label>
              <Input
                id="title"
                placeholder="Implement API rate limiter"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent" className="kb-label">
                Parent Issue
              </Label>
              <select
                id="parent"
                value={parentId ?? ""}
                onChange={(event) =>
                  setParentId(event.target.value ? (event.target.value as Id<"tickets">) : null)
                }
                className="flex h-10 w-full border border-input bg-background/70 px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="">No parent (top-level)</option>
                {tickets.map((ticket) => (
                  <option key={ticket._id} value={ticket._id}>
                    {formatTicketNumber(workspacePrefix, ticket.number) ?? "--"} · {ticket.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="kb-label">
                Description
              </Label>
              <div className="grid gap-4 lg:grid-cols-2">
                <Textarea
                  id="description"
                  placeholder="Describe scope, acceptance criteria, and edge cases..."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={18}
                  className="font-mono"
                />
                <div className="border border-border/75 bg-background/70 p-4">
                  {description.trim() ? (
                    <Markdown content={description} className="prose max-w-none dark:prose-invert" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Live markdown preview</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleCreate} disabled={!title.trim() || isSaving}>
                {isSaving ? "Creating..." : "Create Issue"}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/workspace/${workspaceId}`}>Cancel</Link>
              </Button>
            </div>
          </Card>
        </div>
    </div>
  );
}
