"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/markdown";
import { formatTicketNumber, generateWorkspacePrefix } from "@/lib/utils";
import { IssueStatusBadge, STATUS_META, IssueStatus } from "@/components/issue-status";
import { PRIORITY_META, type TicketPriority } from "@/lib/priority";
import { SubIssuesCard } from "@/components/issue-detail/sub-issues-card";
import { IssueSidebar } from "@/components/issue-detail/issue-sidebar";
import { TicketDetailHeader } from "@/components/issue-detail/ticket-detail-header";
import { TicketActivityTabs } from "@/components/issue-detail/ticket-activity-tabs";
import { ArchivedBadge } from "@/components/archived-badge";
import { ArchivedBanner } from "@/components/archived-banner";
import { useWorkspaceData } from "@/components/workspace-data-provider";
import {
  getDispatchExecutionBadgeLabelForTicket,
  getLatestDispatchExecutionByTicketId,
} from "@/lib/dispatch-executions";

type Ticket = Doc<"tickets">;

const getOrderValue = (ticket: Ticket) => ticket.order ?? ticket.createdAt;

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id as Id<"workspaces">;
  const ticketId = params.ticketId as Id<"tickets">;
  const [shouldLoadTicketIndex, setShouldLoadTicketIndex] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setShouldLoadTicketIndex(true);
    });
  }, []);

  const convex = useConvex();
  const renderCount = useRef(0);
  renderCount.current += 1;

  // Debug: check if prewarm data is in cache before useQuery subscribes
  const watch = convex.watchQuery(api.tickets.getHierarchy, { id: ticketId });
  const cachedResult = watch.localQueryResult();
  console.log(`[detail] render #${renderCount.current} — cached:`, cachedResult !== undefined ? "✓" : "✗");

  const { workspace, dispatchExecutions } = useWorkspaceData();
  const hierarchy = useQuery(api.tickets.getHierarchy, { id: ticketId });
  console.log(`[detail] render #${renderCount.current} — useQuery:`, hierarchy !== undefined ? "✓" : "✗");
  const allTickets = useQuery(
    api.tickets.list,
    shouldLoadTicketIndex ? { workspaceId } : "skip"
  );
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
  useEffect(() => {
    router.prefetch(backHref);
  }, [backHref, router]);
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
  const latestDispatchExecutionByTicketId = useMemo(
    () => getLatestDispatchExecutionByTicketId(dispatchExecutions),
    [dispatchExecutions]
  );

  const commentsList = comments ?? [];
  const activitiesList = activities ?? [];
  const commentsLoading = comments === undefined;
  const activitiesLoading = activities === undefined;

  const actorUserIds = useMemo(() => {
    const ids = new Set<string>();
    commentsList.forEach((comment) => {
      if (comment.authorType === "user") ids.add(comment.authorId);
    });
    activitiesList.forEach((event) => {
      if (event.actorType === "user") ids.add(event.actorId);
    });
    return Array.from(ids);
  }, [commentsList, activitiesList]);

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

  // Sync form state from ticket data during render (React-recommended pattern
  // to avoid cascading renders from setState-in-useEffect).
  const [syncedTicketKey, setSyncedTicketKey] = useState("");
  const currentTicketKey = ticket && !isEditing ? `${ticket._id}:${ticket.updatedAt}` : "";
  if (currentTicketKey && currentTicketKey !== syncedTicketKey) {
    setSyncedTicketKey(currentTicketKey);
    setTitle(ticket!.title);
    setDescription(ticket!.description);
    setParentId(ticket!.parentId ?? null);
  } else if (!currentTicketKey && syncedTicketKey) {
    setSyncedTicketKey("");
  }

  // Clear optimistic status once server confirms
  if (optimisticStatus && ticket?.status === optimisticStatus) {
    setOptimisticStatus(null);
  }

  if (
    workspace === undefined ||
    hierarchy === undefined ||
    allTickets === undefined
  ) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-5 w-5 border-2 border-primary/40 border-t-primary animate-spin" />
          <div className="kb-label">Loading...</div>
        </div>
      </div>
    );
  }

  if (!ticket || workspace === null || ticket.workspaceId !== workspaceId) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-center">
        <div>
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
  const effectiveStatus = optimisticStatus ?? ticket.status;
  const effectiveTicket = {
    ...ticket,
    status: effectiveStatus,
    ownerId: effectiveStatus === "unclaimed" || effectiveStatus === "backlog" ? undefined : ticket.ownerId,
    ownerType: effectiveStatus === "unclaimed" || effectiveStatus === "backlog" ? undefined : ticket.ownerType,
    ownerDisplayName:
      effectiveStatus === "unclaimed" || effectiveStatus === "backlog" ? undefined : ticket.ownerDisplayName,
  };
  const latestDispatchExecution = latestDispatchExecutionByTicketId.get(ticket._id) ?? null;
  const dispatchExecutionBadgeLabel =
    effectiveTicket.status === "dispatched"
      ? getDispatchExecutionBadgeLabelForTicket(
          effectiveTicket,
          latestDispatchExecution
        )
      : null;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatActivity = (event: { type: string; data?: Record<string, any> }) => {
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
            case "priority":
              return "priority";
            default:
              return field;
          }
        });
        return `Updated ${labels.join(", ")}`;
      }
      case "ticket_dispatched": {
        const instanceName = event.data?.instanceName;
        const runId = event.data?.runId;
        if (instanceName && runId) {
          return `Dispatched via ${instanceName} (run: ${runId})`;
        }
        if (instanceName) {
          return `Dispatched via ${instanceName}`;
        }
        return "Dispatched to OpenClaw";
      }
      case "ticket_dispatch_cancelled": {
        const runId = event.data?.runId;
        const instanceName = event.data?.instanceName;
        if (instanceName && runId) {
          return `Requested cancellation for run ${runId} on ${instanceName}`;
        }
        if (runId) {
          return `Requested cancellation for run ${runId}`;
        }
        return "Requested dispatch cancellation";
      }
      case "ticket_dispatch_received":
        return "OpenClaw plugin acknowledged receipt of dispatch";
      case "ticket_dispatch_started":
        return "OpenClaw plugin reported dispatch started";
      case "ticket_dispatch_finished":
        return "OpenClaw plugin reported dispatch finished";
      case "ticket_dispatch_cancel_acknowledged":
      {
        const base =
          event.data?.message ??
          "OpenClaw plugin acknowledged cancellation request";
        const hardKill = event.data?.metadata?.hardKillAttempt as
          | {
              attempted?: boolean;
              mode?: string;
              abortCallsSucceeded?: number;
              stopMessagesQueued?: number;
              limitations?: string;
            }
          | undefined;
        if (!hardKill || !hardKill.attempted) {
          return base;
        }
        const aborts = Number(hardKill.abortCallsSucceeded ?? 0);
        const stops = Number(hardKill.stopMessagesQueued ?? 0);
        const mode = typeof hardKill.mode === "string" ? hardKill.mode : "unknown";
        if (aborts > 0 || stops > 0) {
          return `${base} (hard kill ${mode}: aborts=${aborts}, stop_msgs=${stops})`;
        }
        if (typeof hardKill.limitations === "string" && hardKill.limitations.trim()) {
          return `${base} (hard kill ${mode}: ${hardKill.limitations})`;
        }
        return `${base} (hard kill ${mode}: no immediate abort signal succeeded)`;
      }
      case "ticket_dispatch_cancel_result": {
        const result = String(event.data?.metadata?.result ?? "");
        const message = event.data?.message;
        if (typeof message === "string" && message.trim()) {
          return message;
        }
        switch (result) {
          case "cancelled":
            return "OpenClaw plugin reported dispatch cancelled";
          case "too_late":
          case "too_late_to_cancel":
            return "OpenClaw plugin reported cancellation was too late";
          default:
            return "OpenClaw plugin reported cancellation result";
        }
      }
      case "ticket_dispatch_progress": {
        const message = event.data?.message;
        const toolName = event.data?.metadata?.toolName;
        const phase = event.data?.metadata?.phase;
        if (typeof message === "string" && message.trim()) {
          return message;
        }
        if (toolName && phase === "tool_start") {
          return `OpenClaw started tool ${toolName}`;
        }
        if (toolName && phase === "tool_end") {
          return `OpenClaw completed tool ${toolName}`;
        }
        return "OpenClaw plugin progress update";
      }
      case "ticket_dispatch_blocked":
        return event.data?.message ?? "OpenClaw plugin reported a blocker";
      case "ticket_dispatch_ticket_failed":
        return event.data?.message ?? "OpenClaw plugin reported ticket failure";
      case "ticket_dispatch_ticket_finished":
        return event.data?.message ?? "OpenClaw plugin reported ticket completion";
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
    <div className="min-h-full">
      <TicketDetailHeader
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        backHref={backHref}
        ancestors={ancestors}
        workspacePrefix={workspacePrefix}
        ticketNumber={ticketNumber}
        isEditing={isEditing}
        ticketArchived={Boolean(ticket.archived)}
        onToggleEdit={() => setIsEditing((prev) => !prev)}
        onToggleArchive={() => {
          updateTicket({ id: ticket._id, archived: !(ticket.archived ?? false) }).catch((error) => {
            console.error(error);
          });
        }}
        onDelete={handleDelete}
      />

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
                  {ticket.priority && ticket.priority !== "none" && (
                    <span
                      className="inline-flex border px-1.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-black"
                      style={{
                        backgroundColor: PRIORITY_META[ticket.priority].color,
                        borderColor: PRIORITY_META[ticket.priority].color,
                      }}
                    >
                      {PRIORITY_META[ticket.priority].shortLabel}
                    </span>
                  )}
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

              <TicketActivityTabs
                commentsLoading={commentsLoading}
                commentsList={commentsList}
                activitiesLoading={activitiesLoading}
                activitiesList={activitiesList}
                formatActorName={formatActorName}
                formatActivity={formatActivity}
                newComment={newComment}
                isAddingComment={isAddingComment}
                onNewCommentChange={setNewComment}
                onClearNewComment={() => setNewComment("")}
                onAddComment={handleAddComment}
              />
            </div>

            {/* ── Right sidebar ── */}
            <IssueSidebar
              ticket={effectiveTicket}
              workspaceId={workspaceId}
              workspacePrefix={workspacePrefix}
              progressDone={progressDone}
              progressTotal={progressTotal}
              progressPct={progressPct}
              dispatchExecutionDispatchId={latestDispatchExecution?.dispatchId ?? null}
              dispatchExecutionBadgeLabel={dispatchExecutionBadgeLabel}
              onStatusChange={(status) => {
                if (
                  effectiveTicket.status === "dispatched" &&
                  status === "unclaimed" &&
                  !window.confirm(
                    "This ticket is dispatched to OpenClaw. Moving it back to unclaimed before cancelling dispatch can cause duplicate work. Prefer 'Cancel Dispatch' first. Continue anyway?"
                  )
                ) {
                  return;
                }
                setOptimisticStatus(status);
                updateStatus({
                  id: ticket._id,
                  status,
                }).catch((error) => {
                  setOptimisticStatus(null);
                  console.error(error);
                });
              }}
              onForceReturnToUnclaimed={async () => {
                setOptimisticStatus("unclaimed");
                try {
                  await updateStatus({
                    id: ticket._id,
                    status: "unclaimed",
                  });
                } catch (error) {
                  setOptimisticStatus(null);
                  throw error;
                }
              }}
              onPriorityChange={(priority: TicketPriority) => {
                updateTicket({
                  id: ticket._id,
                  priority,
                }).catch((error) => {
                  console.error(error);
                });
              }}
            />
          </div>
        </div>
    </div>
  );
}
