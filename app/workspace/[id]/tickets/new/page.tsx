"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (!parentFromQuery || !tickets) return;
    const match = tickets.find((ticket) => ticket._id === parentFromQuery);
    if (match) {
      setParentId(match._id);
    }
  }, [parentFromQuery, tickets]);

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
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/workspace/${workspaceId}`}>
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div>
              <div className="text-xs text-muted-foreground">{workspace.name}</div>
              <h1 className="text-xl font-semibold">New Issue</h1>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={!title.trim() || isSaving}>
            <Plus className="w-4 h-4 mr-2" />
            {isSaving ? "Creating..." : "Create Issue"}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Add price modal"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parent">Parent Issue</Label>
            <select
              id="parent"
              value={parentId ?? ""}
              onChange={(event) =>
                setParentId(event.target.value ? (event.target.value as Id<"tickets">) : null)
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">No parent (top-level)</option>
              {tickets.map((ticket) => (
                <option key={ticket._id} value={ticket._id}>
                  {formatTicketNumber(workspacePrefix, ticket.number) ?? "—"} · {ticket.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">
              Description
              <span className="text-muted-foreground ml-2 font-normal">
                - keep leaf issues ralph-sized
              </span>
            </Label>
            <div className="grid gap-4 lg:grid-cols-2">
              <Textarea
                id="description"
                placeholder="Add a price modal with monthly/annual toggle..."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={18}
                className="font-mono"
              />
              <div className="rounded-md border bg-background p-4">
                {description.trim() ? (
                  <Markdown content={description} className="prose-lg" />
                ) : (
                  <p className="text-sm text-muted-foreground">Live preview</p>
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
      </main>
    </div>
  );
}
