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
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { formatTicketNumber, generateWorkspacePrefix } from "@/lib/utils";
import { IssueStatusBadge, STATUS_META, IssueStatus } from "@/components/issue-status";
import { SubIssuesCard } from "@/components/issue-detail/sub-issues-card";
import { IssueSidebar } from "@/components/issue-detail/issue-sidebar";
import { ArchivedBadge } from "@/components/archived-badge";
import { ArchivedBanner } from "@/components/archived-banner";
import { UserMenu } from "@/components/user-menu";

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
  const comments = useQuery(api.ticketComments.listByTicket, { ticketId });
  const activities = useQuery(api.ticketActivities.listByTicket, { ticketId });

  const updateTicket = useMutation(api.tickets.update);
  const updateStatus = useMutation(api.tickets.updateStatus);
  const deleteTicket = useMutation(api.tickets.remove);
  const addComment = useMutation(api.ticketComments.add);

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<Id<"tickets"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [existingChildId, setExistingChildId] = useState<Id<"tickets"> | "">("");
  const [isAddingExisting, setIsAddingExisting] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<IssueStatus | null>(null);

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

  const actorUserIds = useMemo(() => {
    const ids = new Set<string>();
    comments?.forEach((comment) => {
      if (comment.authorType === "user") ids.add(comment.authorId);
    });
    activities?.forEach((event) => {
      if (event.actorType === "user") ids.add(event.actorId);
    });
    return Array.from(ids);
  }, [comments, activities]);

  const actorProfiles = useQuery(
    api.userProfiles.getByAuthIds,
    actorUserIds.length > 0 ? { betterAuthUserIds: actorUserIds } : "skip"
  );

  const actorProfileMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof actorProfiles>[number]>();
    actorProfiles?.forEach((profile) => {
      map.set(profile.betterAuthUserId, profile);
    });
    return map;
  }, [actorProfiles]);

  useEffect(() => {
    if (!ticket || isEditing) return;
    setTitle(ticket.title);
    setDescription(ticket.description);
    setParentId(ticket.parentId ?? null);
  }, [ticket, isEditing]);

  useEffect(() => {
    if (!optimisticStatus) return;
    if (ticket?.status === optimisticStatus) {
      setOptimisticStatus(null);
    }
  }, [ticket?.status, optimisticStatus]);

  if (
    workspace === undefined ||
    hierarchy === undefined ||
    allTickets === undefined ||
    comments === undefined ||
    activities === undefined
  ) {
    return (
      <main className="min-h-screen p-4 md:p-6">
        <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-8 md:min-h-[calc(100vh-3rem)]">
          <div className="kb-label">Loading issue detail...</div>
        </div>
      </main>
    );
  }

  if (!ticket || workspace === null || ticket.workspaceId !== workspaceId) {
    return (
      <main className="min-h-screen p-4 md:p-6">
        <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-8 text-center md:min-h-[calc(100vh-3rem)]">
        <div>
          <h1 className="text-2xl font-bold mb-4">Issue not found</h1>
          <Link href={backHref}>
            <Button>Back to Workspace</Button>
          </Link>
        </div>
        </div>
      </main>
    );
  }

  const workspacePrefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);
  const ticketNumber = formatTicketNumber(workspacePrefix, ticket.number);
  const progressTotal = ticket.childCount ?? 0;
  const progressDone = ticket.childDoneCount ?? 0;
  const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;
  const effectiveStatus = optimisticStatus ?? ticket.status;
  const effectiveTicket = {
    ...ticket,
    status: effectiveStatus,
    ownerId: effectiveStatus === "unclaimed" ? undefined : ticket.ownerId,
    ownerType: effectiveStatus === "unclaimed" ? undefined : ticket.ownerType,
    ownerDisplayName:
      effectiveStatus === "unclaimed" ? undefined : ticket.ownerDisplayName,
  };

  const formatActorName = (
    actorType: string,
    actorId: string,
    actorDisplayName?: string | null
  ) => {
    if (actorType === "user") {
      const profile = actorProfileMap.get(actorId);
      return profile?.name || profile?.email || actorId;
    }
    return actorDisplayName || actorId;
  };

  const formatStatusLabel = (status: string) =>
    STATUS_META[status as keyof typeof STATUS_META]?.label ?? status;

  const formatActivity = (event: any) => {
    switch (event.type) {
      case "ticket_created":
        return "Issue created";
      case "ticket_deleted":
        return "Issue deleted";
      case "ticket_comment_added":
        return "Comment added";
      case "ticket_status_changed": {
        const next = event.data?.to;
        return `Status changed to ${formatStatusLabel(String(next ?? ""))}`;
      }
      case "ticket_assignment_changed": {
        const to = event.data?.to;
        if (!to || !to.ownerId) return "Assignee cleared";
        const assignee = to.ownerDisplayName || to.ownerId;
        return `Assigned to ${assignee}`;
      }
      case "ticket_updated": {
        const changes = event.data?.changes;
        const fields = changes ? Object.keys(changes) : [];
        if (!fields.length) return "Issue updated";
        const labels = fields.map((field) => {
          switch (field) {
            case "parentId":
              return "parent";
            case "archived":
              return "archive status";
            default:
              return field;
          }
        });
        return `Updated ${labels.join(", ")}`;
      }
      default:
        return event.type ?? "Activity";
    }
  };


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

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setIsAddingComment(true);
    try {
      await addComment({
        ticketId: ticket._id,
        body: newComment.trim(),
      });
      setNewComment("");
    } finally {
      setIsAddingComment(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="kb-shell min-h-[calc(100vh-2rem)] overflow-hidden md:min-h-[calc(100vh-3rem)]">
      <header className="kb-header border-b-2 border-primary/45 sticky top-0 z-10">
        <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={backHref}>
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div>
              <div className="kb-label">{workspace.name}</div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-[0.04em]">Issue</h1>
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
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6">
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

        {ticket.archived && <ArchivedBanner />}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {ticketNumber && (
                  <span className="font-mono">{ticketNumber}</span>
                )}
                <IssueStatusBadge status={effectiveStatus} />
                {progressTotal > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {progressDone}/{progressTotal} sub-issues
                  </Badge>
                )}
                {ticket.archived && <ArchivedBadge />}
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

            <Card className="p-6 space-y-4 bg-card/40">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Comments</h3>
              </div>
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment._id} className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-foreground font-medium">
                          {formatActorName(
                            comment.authorType,
                            comment.authorId,
                            comment.authorDisplayName
                          )}
                        </span>
                        <span>•</span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="rounded-md border bg-background/60 p-3">
                        <Markdown content={comment.body} className="prose-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="new-comment">Add a comment</Label>
                <Textarea
                  id="new-comment"
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  rows={4}
                  className="font-mono"
                  placeholder="Share updates, blockers, or context..."
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || isAddingComment}
                  >
                    {isAddingComment ? "Posting..." : "Post Comment"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setNewComment("")}
                    disabled={!newComment.trim() || isAddingComment}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-4 bg-card/40">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Activity</h3>
              </div>
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((event) => (
                    <div key={event._id} className="flex flex-col gap-1">
                      <div className="text-sm">{formatActivity(event)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatActorName(
                          event.actorType,
                          event.actorId,
                          event.actorDisplayName
                        )}{" "}
                        • {new Date(event.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

            <IssueSidebar
            ticket={effectiveTicket}
            workspaceId={workspaceId}
            progressDone={progressDone}
            progressTotal={progressTotal}
            progressPct={progressPct}
            onStatusChange={(status) => {
              setOptimisticStatus(status);
              updateStatus({
                id: ticket._id,
                status,
              }).catch((error) => {
                setOptimisticStatus(null);
                console.error(error);
              });
            }}
          />
        </div>
      </div>
      </div>
    </main>
  );
}
