"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { formatTicketNumber, generateWorkspacePrefix } from "@/lib/utils";
import { IssueStatusBadge } from "@/components/issue-status";
import { SubIssuesCard } from "@/components/issue-detail/sub-issues-card";
import { IssueSidebar } from "@/components/issue-detail/issue-sidebar";

type Ticket = Doc<"tickets">;

const getOrderValue = (ticket: Ticket) => ticket.order ?? ticket.createdAt;

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id as Id<"workspaces">;
  const ticketId = params.ticketId as Id<"tickets">;

  const workspace = useQuery(api.workspaces.get, { id: workspaceId });
  const hierarchy = useQuery(api.tickets.getHierarchy, { id: ticketId });
  const allTickets = useQuery(api.tickets.list, { workspaceId });

  const updateTicket = useMutation(api.tickets.update);
  const updateStatus = useMutation(api.tickets.updateStatus);
  const deleteTicket = useMutation(api.tickets.remove);

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<Id<"tickets"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [existingChildId, setExistingChildId] = useState<Id<"tickets"> | "">("");
  const [isAddingExisting, setIsAddingExisting] = useState(false);

  const ticket = hierarchy?.ticket ?? null;
  const ancestors = hierarchy?.ancestors ?? [];
  const ticketsList = useMemo(() => allTickets ?? [], [allTickets]);
  const activeTicketId = ticket?._id ?? null;
  const activeParentId = ticket?.parentId ?? null;
  const backTab = searchParams.get("tab");
  const backHref = backTab ? `/workspace/${workspaceId}?tab=${backTab}` : `/workspace/${workspaceId}`;
  const children = useMemo(() => {
    if (!hierarchy?.children) return [];
    return hierarchy.children
      .filter((child) => !(child.archived ?? false))
      .slice()
      .sort((a, b) => getOrderValue(a) - getOrderValue(b));
  }, [hierarchy?.children]);
  const availableParents = useMemo(
    () => ticketsList.filter((candidate) => candidate._id !== activeTicketId),
    [ticketsList, activeTicketId]
  );
  const parentTicket = useMemo(() => {
    if (!activeParentId) return null;
    return availableParents.find((candidate) => candidate._id === activeParentId) ?? null;
  }, [availableParents, activeParentId]);
  const descendantIds = useMemo(() => {
    if (!activeTicketId) return new Set<Id<"tickets">>();
    const childrenByParent = new Map<Id<"tickets">, Ticket[]>();
    for (const entry of ticketsList) {
      const parentId = entry.parentId;
      if (!parentId) continue;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(entry);
      childrenByParent.set(parentId, list);
    }
    const visited = new Set<Id<"tickets">>();
    const stack: Id<"tickets">[] = [activeTicketId];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      const childrenList = childrenByParent.get(current) ?? [];
      for (const child of childrenList) {
        if (visited.has(child._id)) continue;
        visited.add(child._id);
        stack.push(child._id);
      }
    }
    return visited;
  }, [activeTicketId, ticketsList]);
  const availableChildCandidates = useMemo(() => {
    if (!activeTicketId) return [];
    return ticketsList
      .filter((candidate) => candidate._id !== activeTicketId)
      .filter((candidate) => !(candidate.archived ?? false))
      .filter((candidate) => !descendantIds.has(candidate._id))
      .filter((candidate) => candidate.parentId !== activeTicketId);
  }, [ticketsList, descendantIds, activeTicketId]);

  useEffect(() => {
    if (!ticket || isEditing) return;
    setTitle(ticket.title);
    setDescription(ticket.description);
    setParentId(ticket.parentId ?? null);
  }, [ticket, isEditing]);

  if (workspace === undefined || hierarchy === undefined || allTickets === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!ticket || workspace === null || ticket.workspaceId !== workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Issue not found</h1>
          <Link href={backHref}>
            <Button>Back to Workspace</Button>
          </Link>
        </div>
      </div>
    );
  }

  const workspacePrefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);
  const ticketNumber = formatTicketNumber(workspacePrefix, ticket.number);
  const progressTotal = ticket.childCount ?? 0;
  const progressDone = ticket.childDoneCount ?? 0;
  const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;


  const handleSave = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      await updateTicket({
        id: ticket._id,
        title: title.trim(),
        description: description.trim(),
        parentId: parentId ?? null,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm("Delete this issue and its sub-issues?")) {
      await deleteTicket({ id: ticket._id });
      router.push(backHref);
    }
  };

  const handleAddExistingChild = async () => {
    if (!existingChildId) return;
    const targetId = existingChildId as Id<"tickets">;
    const lastChild = children[children.length - 1];
    const order = lastChild ? getOrderValue(lastChild) + 1000 : ticket.createdAt;
    setIsAddingExisting(true);
    try {
      await updateTicket({
        id: targetId,
        parentId: ticket._id,
        order,
      });
      setExistingChildId("");
    } finally {
      setIsAddingExisting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={backHref}>
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div>
              <div className="text-xs text-muted-foreground">{workspace.name}</div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">Issue</h1>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsEditing((prev) => !prev)}>
              {isEditing ? "Stop Editing" : "Edit"}
            </Button>
            <Button
              variant={ticket.archived ? "secondary" : "outline"}
              onClick={() => updateTicket({ id: ticket._id, archived: !(ticket.archived ?? false) })}
            >
              {ticket.archived ? (
                <>
                  <ArchiveRestore className="w-4 h-4 mr-2" />
                  Unarchive
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Archive
                </>
              )}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="mb-6 text-sm text-muted-foreground">
          <Link href={`/workspace/${workspaceId}`} className="hover:text-primary">
            {workspace.name}
          </Link>
          {ancestors.map((ancestor) => (
            <span key={ancestor._id}>
              {" "}/{" "}
              <Link
                href={`/workspace/${workspaceId}/tickets/${ancestor._id}`}
                className="hover:text-primary"
              >
                <span className="font-mono">
                  {formatTicketNumber(workspacePrefix, ancestor.number) ?? "—"}
                </span>{" "}
                · {ancestor.title}
              </Link>
            </span>
          ))}
          <span>
            {" "}
            /{" "}
            <span className="font-mono">{ticketNumber ?? "—"}</span> · {ticket.title}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {ticketNumber && (
                  <span className="font-mono">{ticketNumber}</span>
                )}
                <IssueStatusBadge status={ticket.status} />
                {progressTotal > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {progressDone}/{progressTotal} sub-issues
                  </Badge>
                )}
                {ticket.archived && (
                  <Badge variant="outline" className="text-[10px]">
                    Archived
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">{ticket.title}</h1>
              {ticket.parentId && (
                <div className="text-sm text-muted-foreground">
                  Sub-issue of{" "}
                  <Link
                    href={`/workspace/${workspaceId}/tickets/${ticket.parentId}`}
                    className="hover:text-primary"
                  >
                    {parentTicket ? (
                      <>
                        <span className="font-mono">
                          {formatTicketNumber(workspacePrefix, parentTicket.number) ?? "—"}
                        </span>{" "}
                        · {parentTicket.title}
                      </>
                    ) : (
                      "parent issue"
                    )}
                  </Link>
                </div>
              )}
            </div>
            {isEditing ? (
              <Card className="p-6 space-y-4 bg-card/40">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent">Parent Issue</Label>
                  <select
                    id="parent"
                    value={parentId ?? ""}
                    onChange={(event) =>
                      setParentId(
                        event.target.value
                          ? (event.target.value as Id<"tickets">)
                          : null
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">No parent (top-level)</option>
                    {availableParents.map((candidate) => (
                      <option key={candidate._id} value={candidate._id}>
                        {formatTicketNumber(workspacePrefix, candidate.number) ?? "—"} ·{" "}
                        {candidate.title}
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
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={18}
                      className="font-mono"
                    />
                    <div className="rounded-md border bg-background/60 p-4">
                      {description.trim() ? (
                        <Markdown content={description} className="prose-lg" />
                      ) : (
                        <p className="text-sm text-muted-foreground">Live preview</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-6 space-y-4 bg-card/40">
                {ticket.description ? (
                  <Markdown content={ticket.description} className="prose-lg" />
                ) : (
                  <p className="text-sm text-muted-foreground">No description yet.</p>
                )}
              </Card>
            )}

            <SubIssuesCard
              workspaceId={workspaceId}
              workspacePrefix={workspacePrefix}
              ticketId={ticket._id}
              progressDone={progressDone}
              progressTotal={progressTotal}
              subIssues={children}
              availableChildCandidates={availableChildCandidates}
              existingChildId={existingChildId}
              onExistingChildChange={setExistingChildId}
              onAddExisting={handleAddExistingChild}
              isAddingExisting={isAddingExisting}
            />
          </div>

          <IssueSidebar
            ticket={ticket}
            workspaceId={workspaceId}
            progressDone={progressDone}
            progressTotal={progressTotal}
            progressPct={progressPct}
            onStatusChange={(status) =>
              updateStatus({
                id: ticket._id,
                status,
              })
            }
          />
        </div>
      </main>
    </div>
  );
}
