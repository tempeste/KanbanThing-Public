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
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/markdown";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  MessageSquare,
  History,
  Trash2,
  ChevronRight,
  Pencil,
  X,
  Send,
  MoreHorizontal,
} from "lucide-react";
import { formatTicketNumber, generateWorkspacePrefix } from "@/lib/utils";
import { IssueStatusBadge, STATUS_META, IssueStatus } from "@/components/issue-status";
import { SubIssuesCard } from "@/components/issue-detail/sub-issues-card";
import { IssueSidebar } from "@/components/issue-detail/issue-sidebar";
import { ArchivedBadge } from "@/components/archived-badge";
import { ArchivedBanner } from "@/components/archived-banner";
import { UserMenu } from "@/components/user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Ticket = Doc<"tickets">;

const getOrderValue = (ticket: Ticket) => ticket.order ?? ticket.createdAt;

function RelativeTime({ timestamp }: { timestamp: number }) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return <span>just now</span>;
  if (minutes < 60) return <span>{minutes}m ago</span>;
  if (hours < 24) return <span>{hours}h ago</span>;
  if (days < 30) return <span>{days}d ago</span>;
  return <span>{new Date(timestamp).toLocaleDateString()}</span>;
}

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
  const [activeTab, setActiveTab] = useState<"comments" | "history">("comments");

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
          <div className="flex flex-col items-center gap-3">
            <div className="h-5 w-5 border-2 border-primary/40 border-t-primary animate-spin" />
            <div className="kb-label">Loading...</div>
          </div>
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
        return "Created this issue";
      case "ticket_deleted":
        return "Deleted this issue";
      case "ticket_comment_added":
        return "Added a comment";
      case "ticket_status_changed": {
        const next = event.data?.to;
        return `Changed status to ${formatStatusLabel(String(next ?? ""))}`;
      }
      case "ticket_assignment_changed": {
        const to = event.data?.to;
        if (!to || !to.ownerId) return "Cleared the assignee";
        const assignee = to.ownerDisplayName || to.ownerId;
        return `Assigned to ${assignee}`;
      }
      case "ticket_updated": {
        const changes = event.data?.changes;
        const fields = changes ? Object.keys(changes) : [];
        if (!fields.length) return "Updated this issue";
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
        {/* ── Compact top bar ── */}
        <header className="border-b border-border/60 bg-card/50">
          <div className="flex items-center justify-between px-4 py-2.5 md:px-6">
            {/* Left: back + breadcrumb */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Link
                href={backHref}
                className="shrink-0 p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>

              <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
                <Link
                  href={`/workspace/${workspaceId}`}
                  className="shrink-0 hover:text-foreground transition-colors"
                >
                  {workspace.name}
                </Link>
                {ancestors.map((ancestor) => (
                  <span key={ancestor._id} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                    <Link
                      href={`/workspace/${workspaceId}/tickets/${ancestor._id}`}
                      className="hover:text-foreground transition-colors font-mono text-xs"
                    >
                      {formatTicketNumber(workspacePrefix, ancestor.number) ?? "—"}
                    </Link>
                  </span>
                ))}
                <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                <span className="font-mono text-xs text-foreground/70 truncate">
                  {ticketNumber}
                </span>
              </nav>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setIsEditing((prev) => !prev)}
              >
                {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                {isEditing ? "Cancel" : "Edit"}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 border-border/80 bg-card/95">
                  <DropdownMenuItem
                    onClick={() =>
                      updateTicket({ id: ticket._id, archived: !(ticket.archived ?? false) })
                    }
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
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Issue
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-5 bg-border/50 mx-1" />
              <UserMenu />
            </div>
          </div>
        </header>

        {/* ── Main content ── */}
        <div className="p-5 md:p-8">
          {ticket.archived && <ArchivedBanner />}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            {/* ── Left column: issue content ── */}
            <div className="min-w-0">
              {/* Title block */}
              <div className="mb-8">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="font-mono text-xs text-muted-foreground tracking-wide">
                    {ticketNumber}
                  </span>
                  <IssueStatusBadge status={effectiveStatus} />
                  {progressTotal > 0 && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {progressDone}/{progressTotal}
                    </Badge>
                  )}
                  {ticket.archived && <ArchivedBadge />}
                </div>

                {isEditing ? (
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="text-2xl font-semibold tracking-tight border-none bg-transparent px-0 h-auto text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                    style={{ fontSize: "1.75rem", lineHeight: "2.25rem" }}
                  />
                ) : (
                  <h1 className="text-[1.75rem] leading-[2.25rem] font-semibold tracking-tight">
                    {ticket.title}
                  </h1>
                )}

                {ticket.parentId && !isEditing && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Sub-issue of{" "}
                    <Link
                      href={`/workspace/${workspaceId}/tickets/${ticket.parentId}`}
                      className="hover:text-primary transition-colors"
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

              {/* ── Edit form or Description ── */}
              {isEditing ? (
                <div className="space-y-5 mb-8">
                  <div className="space-y-2">
                    <Label htmlFor="parent" className="kb-label">
                      Parent Issue
                    </Label>
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
                      className="flex h-9 w-full border border-input bg-background/70 px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    <Label htmlFor="description" className="kb-label">
                      Description
                      <span className="text-muted-foreground/60 ml-2 font-normal normal-case tracking-normal">
                        keep leaf issues ralph-sized
                      </span>
                    </Label>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={18}
                        className="font-mono text-sm"
                      />
                      <div className="border border-border/50 bg-background/40 p-5">
                        {description.trim() ? (
                          <Markdown content={description} />
                        ) : (
                          <p className="text-sm text-muted-foreground/50 italic">Preview</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={handleSave} disabled={!title.trim() || isSaving} size="sm">
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                      Discard
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mb-8">
                  {ticket.description ? (
                    <div className="border-l-2 border-primary/20 pl-5">
                      <Markdown content={ticket.description} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground/60 italic">
                      No description.{" "}
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-primary/70 hover:text-primary transition-colors not-italic"
                      >
                        Add one
                      </button>
                    </p>
                  )}
                </div>
              )}

              <Separator className="mb-8 opacity-40" />

              {/* ── Sub-issues ── */}
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

              <Separator className="my-8 opacity-40" />

              {/* ── Tabbed: Comments / History ── */}
              <div>
                <div className="flex items-center gap-0 mb-5">
                  <button
                    onClick={() => setActiveTab("comments")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeTab === "comments"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground/80"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Comments
                    {comments.length > 0 && (
                      <span className="font-mono text-[10px] text-muted-foreground ml-0.5">
                        {comments.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("history")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeTab === "history"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground/80"
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    History
                    {activities.length > 0 && (
                      <span className="font-mono text-[10px] text-muted-foreground ml-0.5">
                        {activities.length}
                      </span>
                    )}
                  </button>
                </div>

                <div className="border-t border-border/30 -mt-px" />

                {/* ── Comments tab ── */}
                {activeTab === "comments" && (
                  <div className="pt-5 space-y-4">
                    {comments.length === 0 && (
                      <p className="text-sm text-muted-foreground/60 italic py-2">
                        No comments yet.
                      </p>
                    )}

                    {comments.map((comment) => (
                      <div key={comment._id} className="group">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-sm font-medium">
                            {formatActorName(
                              comment.authorType,
                              comment.authorId,
                              comment.authorDisplayName
                            )}
                          </span>
                          <span className="text-[11px] text-muted-foreground/60 font-mono">
                            <RelativeTime timestamp={comment.createdAt} />
                          </span>
                        </div>
                        <div className="pl-0">
                          <Markdown content={comment.body} className="prose-sm" />
                        </div>
                      </div>
                    ))}

                    {/* Comment input */}
                    <div className="pt-2">
                      <div className="border border-border/50 bg-background/40 focus-within:border-primary/30 transition-colors">
                        <Textarea
                          value={newComment}
                          onChange={(event) => setNewComment(event.target.value)}
                          rows={3}
                          className="border-0 bg-transparent font-mono text-sm resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          placeholder="Leave a comment..."
                        />
                        <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
                          {newComment.trim() && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => setNewComment("")}
                              disabled={isAddingComment}
                            >
                              Clear
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={handleAddComment}
                            disabled={!newComment.trim() || isAddingComment}
                          >
                            <Send className="w-3 h-3" />
                            {isAddingComment ? "Posting..." : "Comment"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── History tab ── */}
                {activeTab === "history" && (
                  <div className="pt-5">
                    {activities.length === 0 ? (
                      <p className="text-sm text-muted-foreground/60 italic py-2">
                        No activity yet.
                      </p>
                    ) : (
                      <div className="space-y-0">
                        {activities.map((event, index) => {
                          const isLast = index === activities.length - 1;
                          return (
                            <div key={event._id} className="relative pl-5">
                              {!isLast && (
                                <span
                                  aria-hidden
                                  className="absolute left-[4.5px] top-[14px] h-[calc(100%-6px)] w-px bg-border/40"
                                />
                              )}
                              <span
                                aria-hidden
                                className="absolute left-0 top-[6px] h-[10px] w-[10px] border border-border/60 bg-card"
                              />
                              <div className="pb-4">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-sm">
                                    {formatActorName(
                                      event.actorType,
                                      event.actorId,
                                      event.actorDisplayName
                                    )}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    {formatActivity(event).toLowerCase()}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground/50 font-mono">
                                  <RelativeTime timestamp={event.createdAt} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right sidebar ── */}
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
