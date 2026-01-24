"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { formatTicketNumber, generateWorkspacePrefix } from "@/lib/utils";

const STATUS_CONFIG = {
  unclaimed: {
    label: "Unclaimed",
    icon: <Circle className="w-3 h-3" />,
    colorClass: "bg-unclaimed/20 text-unclaimed",
  },
  in_progress: {
    label: "In Progress",
    icon: <Clock className="w-3 h-3" />,
    colorClass: "bg-in-progress/20 text-in-progress",
  },
  done: {
    label: "Done",
    icon: <CheckCircle2 className="w-3 h-3" />,
    colorClass: "bg-done/20 text-done",
  },
} as const;

type Ticket = Doc<"tickets">;

type Status = "unclaimed" | "in_progress" | "done";

const getOrderValue = (ticket: Ticket) => ticket.order ?? ticket.createdAt;

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
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
  const ticketsList = allTickets ?? [];
  const children = useMemo(() => {
    if (!hierarchy?.children) return [];
    return hierarchy.children
      .filter((child) => !(child.archived ?? false))
      .slice()
      .sort((a, b) => getOrderValue(a) - getOrderValue(b));
  }, [hierarchy?.children]);
  const availableParents = useMemo(
    () => ticketsList.filter((candidate) => candidate._id !== ticket?._id),
    [ticketsList, ticket?._id]
  );
  const parentTicket = useMemo(() => {
    if (!ticket?.parentId) return null;
    return availableParents.find((candidate) => candidate._id === ticket.parentId) ?? null;
  }, [availableParents, ticket?.parentId]);
  const descendantIds = useMemo(() => {
    if (!ticket) return new Set<string>();
    const childrenByParent = new Map<string, Ticket[]>();
    for (const entry of ticketsList) {
      if (!entry.parentId) continue;
      const list = childrenByParent.get(entry.parentId) ?? [];
      list.push(entry);
      childrenByParent.set(entry.parentId, list);
    }
    const visited = new Set<string>();
    const stack = [ticket._id as string];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      const childrenList = childrenByParent.get(current) ?? [];
      for (const child of childrenList) {
        if (visited.has(child._id)) continue;
        visited.add(child._id);
        stack.push(child._id as string);
      }
    }
    return visited;
  }, [ticket?._id, ticketsList]);
  const availableChildCandidates = useMemo(() => {
    if (!ticket) return [];
    return ticketsList
      .filter((candidate) => candidate._id !== ticket._id)
      .filter((candidate) => !(candidate.archived ?? false))
      .filter((candidate) => !descendantIds.has(candidate._id as string))
      .filter((candidate) => candidate.parentId !== ticket._id);
  }, [ticketsList, descendantIds, ticket?._id]);

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
          <Link href={`/workspace/${workspaceId}`}>
            <Button>Back to Workspace</Button>
          </Link>
        </div>
      </div>
    );
  }

  const workspacePrefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);
  const ticketNumber = formatTicketNumber(workspacePrefix, ticket.number);
  const statusConfig = STATUS_CONFIG[ticket.status];
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
      router.push(`/workspace/${workspaceId}?tab=list`);
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
              <Link href={`/workspace/${workspaceId}`}>
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
                <Badge variant="outline" className={`gap-1 ${statusConfig.colorClass}`}>
                  {statusConfig.icon}
                  {statusConfig.label}
                </Badge>
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

            <Card className="p-6 bg-card/40">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Sub-issues</h3>
                    {progressTotal > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {progressDone}/{progressTotal}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Break down the work into ralph-sized steps.
                  </p>
                </div>
                <Button asChild>
                  <Link href={`/workspace/${workspaceId}/tickets/new?parentId=${ticket._id}`}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Sub-issue
                  </Link>
                </Button>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="w-full">
                  <Label htmlFor="existing-sub-issue">Add existing issue</Label>
                  <select
                    id="existing-sub-issue"
                    value={existingChildId}
                    onChange={(event) =>
                      setExistingChildId(
                        event.target.value ? (event.target.value as Id<"tickets">) : ""
                      )
                    }
                    className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Select an issue</option>
                    {availableChildCandidates.map((candidate) => (
                      <option key={candidate._id} value={candidate._id}>
                        {formatTicketNumber(workspacePrefix, candidate.number) ?? "—"} ·{" "}
                        {candidate.title}
                      </option>
                    ))}
                  </select>
                  {availableChildCandidates.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No available issues to add.
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={handleAddExistingChild}
                  disabled={!existingChildId || isAddingExisting}
                >
                  {isAddingExisting ? "Adding..." : "Add existing"}
                </Button>
              </div>
              <div className="mt-4 space-y-3">
                {children.length === 0 && (
                  <p className="text-sm text-muted-foreground">No sub-issues yet.</p>
                )}
                {children.map((child) => {
                  const childStatus = STATUS_CONFIG[child.status];
                  return (
                    <div
                      key={child._id}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                    >
                      <div>
                        <Link
                          href={`/workspace/${workspaceId}/tickets/${child._id}`}
                          className="font-medium hover:text-primary"
                        >
                          {child.title}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono">
                          {formatTicketNumber(workspacePrefix, child.number) ?? "—"}
                        </div>
                      </div>
                      <Badge variant="outline" className={`gap-1 ${childStatus.colorClass}`}>
                        {childStatus.icon}
                        {childStatus.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="p-4 space-y-3 bg-card/40">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <Badge variant="outline" className={`mt-1 gap-1 ${statusConfig.colorClass}`}>
                  {statusConfig.icon}
                  {statusConfig.label}
                </Badge>
                <select
                  className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  value={ticket.status}
                  onChange={(event) =>
                    updateStatus({
                      id: ticket._id,
                      status: event.target.value as Status,
                    })
                  }
                >
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                    <option key={status} value={status}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Owner</div>
                {ticket.ownerId ? (
                  <div className="mt-1 inline-flex items-center gap-1 text-sm">
                    {ticket.ownerType === "agent" ? (
                      <Bot className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <User className="w-3 h-3 text-muted-foreground" />
                    )}
                    {ticket.ownerId}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">Unassigned</div>
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Updated</div>
                <div className="text-sm">
                  {new Date(ticket.updatedAt).toLocaleString()}
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-2 bg-card/40">
              <div className="text-xs text-muted-foreground">Project Docs</div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/workspace/${workspaceId}/settings`}>Open project docs</Link>
              </Button>
            </Card>

            <Card className="p-4 bg-card/40">
              <div className="text-xs text-muted-foreground">Sub-issue progress</div>
              {progressTotal > 0 ? (
                <>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span>
                      {progressDone}/{progressTotal} done
                    </span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">No sub-issues yet.</div>
              )}
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
