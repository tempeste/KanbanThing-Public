"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  startTransition,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { IssueStatus } from "@/components/issue-status";
import { TicketCard } from "@/components/ticket-card";
import { useWorkspaceData } from "@/components/workspace-data-provider";
import { useSession } from "@/lib/auth-client";
import {
  deriveTicketsByStatus,
  deriveVisibleTickets,
  getTicketOrderValue,
  type BoardSortOption,
} from "@/lib/ticket-derivations";
import { beginTicketDrag, endTicketDrag } from "@/lib/ticket-drag";
import { TicketSummary } from "@/lib/ticket-summary";
import {
  getDispatchExecutionBadgeLabelForTicket,
  getLatestDispatchExecutionByTicketId,
} from "@/lib/dispatch-executions";

type Status = IssueStatus;

type OptimisticOwner = {
  ownerId?: string;
  ownerType?: "user" | "agent";
  ownerDisplayName?: string;
};

interface KanbanBoardProps {
  workspaceId: Id<"workspaces">;
  tickets: TicketSummary[];
  workspacePrefix: string;
  showArchived: boolean;
  sortBy?: BoardSortOption;
  visibleStatuses: Set<Status>;
  onVisibleStatusesChange: (next: Set<Status>) => void;
  compact?: boolean;
  toolbarAction?: ReactNode;
}

const ALL_STATUSES: Status[] = ["backlog", "unclaimed", "dispatched", "in_progress", "done"];
const STATUS_META: Record<Status, { label: string; accent: string }> = {
  backlog: { label: "BACKLOG", accent: "var(--backlog)" },
  unclaimed: { label: "UNCLAIMED", accent: "var(--unclaimed)" },
  dispatched: { label: "DISPATCHED", accent: "var(--dispatched)" },
  in_progress: { label: "IN PROGRESS", accent: "var(--in-progress)" },
  done: { label: "DONE", accent: "var(--done)" },
};

type DragOverPosition = "above" | "below" | null;

export function KanbanBoard({
  workspaceId,
  tickets,
  workspacePrefix,
  showArchived,
  sortBy = "order",
  visibleStatuses,
  onVisibleStatusesChange,
  toolbarAction,
}: KanbanBoardProps) {
  const router = useRouter();
  const convex = useConvex();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const userProfile = useQuery(
    api.userProfiles.getByAuthId,
    userId ? { betterAuthUserId: userId } : "skip"
  );
  const { tags: workspaceTags, dispatchExecutions } = useWorkspaceData();

  const [dragOverTicketId, setDragOverTicketId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<DragOverPosition>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const [isDraggingTicket, setIsDraggingTicket] = useState(false);
  const draggedTicketRef = useRef<{ id: Id<"tickets">; status: Status } | null>(null);

  const [optimisticMoves, setOptimisticMoves] = useState<
    Map<string, { status: Status; order: number }>
  >(new Map());
  const [optimisticOwners, setOptimisticOwners] = useState<
    Map<string, OptimisticOwner | null>
  >(new Map());

  const dragRafRef = useRef<number | null>(null);
  const pendingDragStateRef = useRef<{
    ticketId: Id<"tickets"> | null;
    position: DragOverPosition;
    status: Status | null;
  } | null>(null);

  const columnRefs = useRef<Record<Status, HTMLDivElement | null>>({
    backlog: null,
    unclaimed: null,
    dispatched: null,
    in_progress: null,
    done: null,
  });

  const moveTicket = useMutation(api.tickets.move);
  const assignTicket = useMutation(api.tickets.assign);
  const updateTicket = useMutation(api.tickets.update);
  const deleteTicket = useMutation(api.tickets.remove);
  const prefetchedTicketIdsRef = useRef<Set<string>>(new Set());

  const allTicketsById = useMemo(
    () => new Map(tickets.map((ticket) => [ticket._id, ticket])),
    [tickets]
  );
  const latestDispatchExecutionByTicketId = useMemo(
    () => getLatestDispatchExecutionByTicketId(dispatchExecutions),
    [dispatchExecutions]
  );

  const resolvedOptimisticMoves = useMemo(() => {
    if (!optimisticMoves.size) return optimisticMoves;
    const next = new Map(optimisticMoves);
    for (const ticket of tickets) {
      const override = next.get(ticket._id);
      if (!override) continue;
      const currentOrder = ticket.order ?? ticket.createdAt;
      if (ticket.status === override.status && currentOrder === override.order) {
        next.delete(ticket._id);
      }
    }
    return next;
  }, [optimisticMoves, tickets]);

  const resolvedOptimisticOwners = useMemo(() => {
    if (!optimisticOwners.size) return optimisticOwners;
    const next = new Map(optimisticOwners);
    for (const ticket of tickets) {
      const override = next.get(ticket._id);
      if (override === undefined) continue;

      if (override === null) {
        const ownerCleared = !ticket.ownerId && !ticket.ownerType;
        const statusUnowned =
          ticket.status === "unclaimed" ||
          ticket.status === "backlog" ||
          ticket.status === "dispatched";
        if (ownerCleared || statusUnowned) {
          next.delete(ticket._id);
        }
        continue;
      }

      const matchesOwner =
        ticket.ownerId === override.ownerId &&
        ticket.ownerType === override.ownerType &&
        (ticket.ownerDisplayName ?? undefined) === override.ownerDisplayName;
      if (matchesOwner) {
        next.delete(ticket._id);
      }
    }
    return next;
  }, [optimisticOwners, tickets]);

  const mergedTickets = useMemo(() => {
    if (!resolvedOptimisticMoves.size && !resolvedOptimisticOwners.size) return tickets;

    return tickets.map((ticket) => {
      const moveOverride = resolvedOptimisticMoves.get(ticket._id);
      const ownerOverride = resolvedOptimisticOwners.get(ticket._id);
      const next = { ...ticket };

      if (moveOverride) {
        next.status = moveOverride.status;
        next.order = moveOverride.order;
      }

      if (ownerOverride === null) {
        next.ownerId = undefined;
        next.ownerType = undefined;
        next.ownerDisplayName = undefined;
      } else if (ownerOverride) {
        next.ownerId = ownerOverride.ownerId;
        next.ownerType = ownerOverride.ownerType;
        next.ownerDisplayName = ownerOverride.ownerDisplayName;
      }

      return next;
    });
  }, [tickets, resolvedOptimisticMoves, resolvedOptimisticOwners]);

  const visibleTickets = useMemo(
    () => deriveVisibleTickets(mergedTickets, showArchived),
    [mergedTickets, showArchived]
  );
  const ticketsById = useMemo(
    () => new Map(visibleTickets.map((ticket) => [ticket._id, ticket])),
    [visibleTickets]
  );
  const ticketsByStatus = useMemo(
    () => deriveTicketsByStatus(visibleTickets, sortBy),
    [visibleTickets, sortBy]
  );
  const backlogTickets = ticketsByStatus.backlog ?? [];
  const unclaimedTickets = ticketsByStatus.unclaimed;
  const dispatchedTickets = ticketsByStatus.dispatched;
  const inProgressTickets = ticketsByStatus.in_progress;
  const doneTickets = ticketsByStatus.done;

  const backlogVirtualizer = useVirtualizer({
    count: backlogTickets.length,
    getItemKey: (index) => backlogTickets[index]?._id ?? `backlog-${index}`,
    getScrollElement: () => columnRefs.current.backlog,
    estimateSize: () => 120,
    overscan: 10,
  });
  const unclaimedVirtualizer = useVirtualizer({
    count: unclaimedTickets.length,
    getItemKey: (index) => unclaimedTickets[index]?._id ?? `unclaimed-${index}`,
    getScrollElement: () => columnRefs.current.unclaimed,
    estimateSize: () => 120,
    overscan: 10,
  });
  const dispatchedVirtualizer = useVirtualizer({
    count: dispatchedTickets.length,
    getItemKey: (index) => dispatchedTickets[index]?._id ?? `dispatched-${index}`,
    getScrollElement: () => columnRefs.current.dispatched,
    estimateSize: () => 120,
    overscan: 10,
  });
  const inProgressVirtualizer = useVirtualizer({
    count: inProgressTickets.length,
    getItemKey: (index) => inProgressTickets[index]?._id ?? `in-progress-${index}`,
    getScrollElement: () => columnRefs.current.in_progress,
    estimateSize: () => 120,
    overscan: 10,
  });
  const doneVirtualizer = useVirtualizer({
    count: doneTickets.length,
    getItemKey: (index) => doneTickets[index]?._id ?? `done-${index}`,
    getScrollElement: () => columnRefs.current.done,
    estimateSize: () => 120,
    overscan: 10,
  });

  const virtualizerMap = {
    backlog: backlogVirtualizer,
    unclaimed: unclaimedVirtualizer,
    dispatched: dispatchedVirtualizer,
    in_progress: inProgressVirtualizer,
    done: doneVirtualizer,
  };

  const toggleColumnVisibility = useCallback((status: Status) => {
    const next = new Set(visibleStatuses);
    if (next.has(status)) {
      if (next.size <= 1) return;
      next.delete(status);
    } else {
      next.add(status);
    }
    onVisibleStatusesChange(next);
  }, [onVisibleStatusesChange, visibleStatuses]);

  const flushDragState = useCallback(() => {
    dragRafRef.current = null;
    const next = pendingDragStateRef.current;
    pendingDragStateRef.current = null;
    if (!next) return;
    setDragOverTicketId(next.ticketId);
    setDragOverPosition(next.position);
    setDragOverStatus(next.status);
  }, []);

  const scheduleDragState = useCallback(
    (state: {
      ticketId: Id<"tickets"> | null;
      position: DragOverPosition;
      status: Status | null;
    }) => {
      pendingDragStateRef.current = state;
      if (dragRafRef.current !== null) return;
      dragRafRef.current = requestAnimationFrame(flushDragState);
    },
    [flushDragState]
  );

  useEffect(
    () => () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    },
    []
  );

  useEffect(() => {
    backlogVirtualizer.measure();
    unclaimedVirtualizer.measure();
    dispatchedVirtualizer.measure();
    inProgressVirtualizer.measure();
    doneVirtualizer.measure();
  }, [
    backlogTickets,
    unclaimedTickets,
    dispatchedTickets,
    inProgressTickets,
    doneTickets,
    backlogVirtualizer,
    unclaimedVirtualizer,
    dispatchedVirtualizer,
    inProgressVirtualizer,
    doneVirtualizer,
  ]);

  const clearDragState = () => {
    pendingDragStateRef.current = null;
    setDragOverTicketId(null);
    setDragOverPosition(null);
    setDragOverStatus(null);
  };

  const applyOptimisticMove = (ticketId: Id<"tickets">, status: Status, order: number) => {
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      next.set(ticketId, { status, order });
      return next;
    });
  };

  const clearOptimisticMove = (ticketId: Id<"tickets">) => {
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      next.delete(ticketId);
      return next;
    });
  };

  const applyOptimisticOwner = (ticketId: Id<"tickets">, patch: OptimisticOwner | null) => {
    setOptimisticOwners((prev) => {
      const next = new Map(prev);
      next.set(ticketId, patch);
      return next;
    });
  };

  const clearOptimisticOwner = (ticketId: Id<"tickets">) => {
    setOptimisticOwners((prev) => {
      const next = new Map(prev);
      next.delete(ticketId);
      return next;
    });
  };

  const calculateDropOrder = (
    status: Status,
    targetId: Id<"tickets">,
    position: "above" | "below",
    draggingId?: Id<"tickets"> | null
  ) => {
    const columnTickets = (ticketsByStatus[status] ?? []).filter(
      (ticket) => ticket._id !== draggingId
    );
    const targetIndex = columnTickets.findIndex((ticket) => ticket._id === targetId);
    if (targetIndex === -1) return null;
    const prevTicket =
      position === "above" ? columnTickets[targetIndex - 1] : columnTickets[targetIndex];
    const nextTicket =
      position === "above" ? columnTickets[targetIndex] : columnTickets[targetIndex + 1];

    if (prevTicket && nextTicket) {
      return (getTicketOrderValue(prevTicket) + getTicketOrderValue(nextTicket)) / 2;
    }
    if (!prevTicket && nextTicket) {
      return getTicketOrderValue(nextTicket) - 1000;
    }
    if (prevTicket && !nextTicket) {
      return getTicketOrderValue(prevTicket) + 1000;
    }
    return 0;
  };

  const getCardDropPosition = (
    event: React.DragEvent<HTMLElement>
  ): "above" | "below" => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientY - rect.top;
    return offset < rect.height / 2 ? "above" : "below";
  };

  const applyStatusSideEffects = async (
    ticketId: Id<"tickets">,
    previousStatus: Status,
    nextStatus: Status
  ) => {
    if (previousStatus === "unclaimed" && nextStatus === "in_progress" && userId) {
      const displayName = userProfile?.name || userProfile?.email || userId;
      applyOptimisticOwner(ticketId, {
        ownerId: userId,
        ownerType: "user",
        ownerDisplayName: displayName,
      });
      try {
        await assignTicket({
          id: ticketId,
          ownerId: userId,
          ownerType: "user",
          ownerDisplayName: displayName,
        });
      } catch (error) {
        clearOptimisticOwner(ticketId);
        console.error(error);
      }
    }

    if (
      nextStatus === "unclaimed" ||
      nextStatus === "backlog" ||
      nextStatus === "dispatched"
    ) {
      applyOptimisticOwner(ticketId, null);
    }
  };

  const moveTicketToStatus = async (
    ticketId: Id<"tickets">,
    status: Status,
    targetId?: Id<"tickets">,
    position?: "above" | "below"
  ) => {
    const originalStatus =
      draggedTicketRef.current?.id === ticketId
        ? draggedTicketRef.current.status
        : allTicketsById.get(ticketId)?.status;

    const shouldAutoAssign =
      originalStatus === "unclaimed" && status === "in_progress" && Boolean(userId);

    if (shouldAutoAssign && userId) {
      const displayName = userProfile?.name || userProfile?.email || userId;
      applyOptimisticOwner(ticketId, {
        ownerId: userId,
        ownerType: "user",
        ownerDisplayName: displayName,
      });
    }

    if (status === "unclaimed" || status === "backlog" || status === "dispatched") {
      applyOptimisticOwner(ticketId, null);
    }

    let order: number;
    if (targetId && position) {
      const dropOrder = calculateDropOrder(status, targetId, position, ticketId);
      if (dropOrder === null) return;
      order = dropOrder;
    } else {
      const columnTickets = ticketsByStatus[status] ?? [];
      const lastTicket = columnTickets[columnTickets.length - 1];
      const currentTicket = allTicketsById.get(ticketId);
      order = lastTicket
        ? getTicketOrderValue(lastTicket) + 1000
        : currentTicket
          ? getTicketOrderValue(currentTicket)
          : 0;
    }

    applyOptimisticMove(ticketId, status, order);
    try {
      await moveTicket({ id: ticketId, status, order });
      if (originalStatus) {
        await applyStatusSideEffects(ticketId, originalStatus, status);
      }
    } catch (error) {
      clearOptimisticMove(ticketId);
      clearOptimisticOwner(ticketId);
      console.error(error);
    }
  };

  const handleStatusChange = async (ticketId: Id<"tickets">, newStatus: Status) => {
    const current = allTicketsById.get(ticketId);
    if (
      current?.status === "dispatched" &&
      newStatus === "unclaimed" &&
      !window.confirm(
        "This ticket was dispatched to OpenClaw. Moving it back to unclaimed can cause duplicate work if the agent already received it. Prefer 'Cancel Dispatch' first. Continue?"
      )
    ) {
      return;
    }
    await moveTicketToStatus(ticketId, newStatus);
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this issue and its sub-issues?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const handleDragStart = (event: React.DragEvent<HTMLElement>, ticketId: Id<"tickets">) => {
    if (event.dataTransfer.getData("application/x-ticket-id")) return;
    const ticket = allTicketsById.get(ticketId);
    if (ticket) {
      draggedTicketRef.current = { id: ticketId, status: ticket.status };
    }
    const dragRoot =
      (event.currentTarget.closest("[data-ticket-drag-root='true']") as HTMLElement | null) ??
      event.currentTarget;
    beginTicketDrag(event, dragRoot);
    setIsDraggingTicket(true);
    event.dataTransfer.setData("application/x-ticket-id", ticketId);
    event.dataTransfer.setData("text/plain", ticketId);
    event.dataTransfer.effectAllowed = "move";
  };

  const finishDragSession = () => {
    draggedTicketRef.current = null;
    clearDragState();
    setIsDraggingTicket(false);
    endTicketDrag();
  };

  const handleCardClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.closest("a,button,select,textarea,input,[role='menuitem']")) return;
      startTransition(() => {
        router.push(`/workspace/${workspaceId}/tickets/${ticketId}?tab=board`);
      });
    },
    [router, workspaceId]
  );

  const handleCardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      startTransition(() => {
        router.push(`/workspace/${workspaceId}/tickets/${ticketId}?tab=board`);
      });
    },
    [router, workspaceId]
  );

  const prefetchTicketDetail = useCallback(
    (ticketId: Id<"tickets">) => {
      if (prefetchedTicketIdsRef.current.has(ticketId)) return;
      prefetchedTicketIdsRef.current.add(ticketId);
      router.prefetch(`/workspace/${workspaceId}/tickets/${ticketId}?tab=board`);
      const ttl = 30_000;
      console.log("[prewarm] board hover →", ticketId);
      convex.prewarmQuery({ query: api.tickets.getHierarchy, args: { id: ticketId }, extendSubscriptionFor: ttl });
      convex.prewarmQuery({ query: api.ticketComments.listByTicket, args: { ticketId }, extendSubscriptionFor: ttl });
      convex.prewarmQuery({ query: api.ticketActivities.listByTicket, args: { ticketId }, extendSubscriptionFor: ttl });
    },
    [router, convex, workspaceId]
  );

  const displayedStatuses = ALL_STATUSES.filter((s) => visibleStatuses.has(s));
  const isSortedViewDragHintActive = isDraggingTicket && sortBy !== "order";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2">
        <span className="kb-label mr-1">Columns</span>
        {ALL_STATUSES.map((s) => {
          const active = visibleStatuses.has(s);
          return (
            <button
              key={s}
              onClick={() => toggleColumnVisibility(s)}
              className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                active
                  ? "border-foreground/20 bg-foreground/5 text-foreground"
                  : "border-transparent bg-transparent text-muted-foreground/50 hover:text-muted-foreground"
              }`}
            >
              {STATUS_META[s].label}
            </button>
          );
        })}
        {toolbarAction ? <div className="ml-auto">{toolbarAction}</div> : null}
      </div>
      <div className="kb-scroll flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto md:snap-none md:overflow-x-hidden">
        {displayedStatuses.map((status, index) => {
        const statusMeta = STATUS_META[status];
        const countLabel = (ticketsByStatus[status]?.length ?? 0)
          .toString()
          .padStart(2, "0");
        const virtualizer = virtualizerMap[status];
        const columnTickets = ticketsByStatus[status] ?? [];
        const shouldVirtualizeColumn = columnTickets.length > 80;

          return (
            <section
            key={status}
            className={`relative flex min-h-0 min-w-[85vw] shrink-0 snap-center flex-col border-border md:min-w-0 md:flex-1 ${
              index < displayedStatuses.length - 1 ? "border-r" : ""
            } ${dragOverStatus === status ? "bg-white/[0.02]" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (event.target !== event.currentTarget) return;
              scheduleDragState({ ticketId: null, position: null, status });
            }}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                return;
              }
              scheduleDragState({ ticketId: null, position: null, status: null });
            }}
            onDrop={async (event) => {
              event.preventDefault();
              const ticketId = event.dataTransfer.getData(
                "application/x-ticket-id"
              ) as Id<"tickets">;
              if (!ticketId) return;

              try {
                if (dragOverTicketId && dragOverPosition && dragOverTicketId !== ticketId) {
                  await moveTicketToStatus(
                    ticketId,
                    status,
                    dragOverTicketId,
                    dragOverPosition
                  );
                } else {
                  await moveTicketToStatus(ticketId, status);
                }
              } finally {
                finishDragSession();
              }
            }}
          >
            <div
              className="flex items-end justify-between border-b-2 px-4 pb-3 pt-4 md:px-5"
              style={{ borderBottomColor: statusMeta.accent }}
            >
              <span className="font-mono text-[15px] font-extrabold tracking-[0.2em] text-foreground md:text-[21px]">
                {statusMeta.label}
              </span>
              <span
                className="font-mono text-[28px] font-black leading-none md:text-[40px]"
                style={{ color: statusMeta.accent }}
              >
                {countLabel}
              </span>
            </div>

            <div ref={(el) => { columnRefs.current[status] = el; }} className="kb-scroll relative h-full overflow-auto px-3 py-3">
              {isSortedViewDragHintActive && dragOverStatus === status && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/65 backdrop-blur-[2px]">
                  <div className="text-center">
                    <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">
                      Ordered by {sortBy.replace("_", " ")}
                    </div>
                  </div>
                </div>
              )}
              {columnTickets.length === 0 && (
                <div className="pt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
                  No issues
                </div>
              )}

              {columnTickets.length > 0 &&
                (shouldVirtualizeColumn ? (
                  <div
                    className="relative w-full"
                    style={{ height: `${virtualizer.getTotalSize()}px` }}
                  >
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                      const ticket = columnTickets[virtualItem.index];
                      const parentTicket = ticket.parentId
                        ? ticketsById.get(ticket.parentId) ?? null
                        : null;
                      const dispatchExecution =
                        latestDispatchExecutionByTicketId.get(ticket._id);
                      const executionBadgeLabel =
                        ticket.status === "dispatched"
                          ? getDispatchExecutionBadgeLabelForTicket(
                              ticket,
                              dispatchExecution
                            )
                          : null;

                      return (
                        <div
                          key={ticket._id}
                          data-index={virtualItem.index}
                          ref={virtualizer.measureElement}
                          className="absolute left-0 top-0 w-full pb-1"
                          style={{ transform: `translateY(${virtualItem.start}px)` }}
                        >
                          <TicketCard
                            ticket={ticket}
                            workspaceId={workspaceId}
                            workspacePrefix={workspacePrefix}
                            workspaceTags={workspaceTags}
                            parentTicket={parentTicket}
                            accent={statusMeta.accent}
                            isDragOver={dragOverTicketId === ticket._id}
                            onDragStart={(event) => handleDragStart(event, ticket._id)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const rect = event.currentTarget.getBoundingClientRect();
                              const offset = event.clientY - rect.top;
                              const position: DragOverPosition =
                                offset < rect.height / 2 ? "above" : "below";
                              scheduleDragState({
                                ticketId: ticket._id,
                                position,
                                status,
                              });
                            }}
                            onDragLeave={(event) => {
                              const nextTarget = event.relatedTarget;
                              if (
                                nextTarget instanceof Node &&
                                event.currentTarget.contains(nextTarget)
                              ) {
                                return;
                              }
                              scheduleDragState({
                                ticketId: null,
                                position: null,
                                status,
                              });
                            }}
                            onDrop={async (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const draggedId = event.dataTransfer.getData(
                                "application/x-ticket-id"
                              ) as Id<"tickets">;
                              if (!draggedId || draggedId === ticket._id) {
                                return;
                              }
                              const dropPosition = getCardDropPosition(event);
                              await moveTicketToStatus(
                                draggedId,
                                status,
                                ticket._id,
                                dropPosition
                              );
                              clearDragState();
                            }}
                            onDragHandleEnd={() => {
                              finishDragSession();
                            }}
                            onClick={(event) => handleCardClick(event, ticket._id)}
                            onKeyDown={(event) => handleCardKeyDown(event, ticket._id)}
                            onPrefetch={() => prefetchTicketDetail(ticket._id)}
                            onStatusChange={(newStatus) =>
                              handleStatusChange(ticket._id, newStatus)
                            }
                            onArchiveToggle={() =>
                              updateTicket({
                                id: ticket._id,
                                archived: !(ticket.archived ?? false),
                              })
                            }
                            onDelete={() => handleDelete(ticket._id)}
                            showDispatchButton
                            dispatchExecutionBadgeLabel={executionBadgeLabel}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {columnTickets.map((ticket) => {
                      const parentTicket = ticket.parentId
                        ? ticketsById.get(ticket.parentId) ?? null
                        : null;
                      const dispatchExecution =
                        latestDispatchExecutionByTicketId.get(ticket._id);
                      const executionBadgeLabel =
                        ticket.status === "dispatched"
                          ? getDispatchExecutionBadgeLabelForTicket(
                              ticket,
                              dispatchExecution
                            )
                          : null;

                      return (
                        <div key={ticket._id}>
                          <TicketCard
                            ticket={ticket}
                            workspaceId={workspaceId}
                            workspacePrefix={workspacePrefix}
                            workspaceTags={workspaceTags}
                            parentTicket={parentTicket}
                            accent={statusMeta.accent}
                            isDragOver={dragOverTicketId === ticket._id}
                            onDragStart={(event) => handleDragStart(event, ticket._id)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const rect = event.currentTarget.getBoundingClientRect();
                              const offset = event.clientY - rect.top;
                              const position: DragOverPosition =
                                offset < rect.height / 2 ? "above" : "below";
                              scheduleDragState({
                                ticketId: ticket._id,
                                position,
                                status,
                              });
                            }}
                            onDragLeave={(event) => {
                              const nextTarget = event.relatedTarget;
                              if (
                                nextTarget instanceof Node &&
                                event.currentTarget.contains(nextTarget)
                              ) {
                                return;
                              }
                              scheduleDragState({
                                ticketId: null,
                                position: null,
                                status,
                              });
                            }}
                            onDrop={async (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const draggedId = event.dataTransfer.getData(
                                "application/x-ticket-id"
                              ) as Id<"tickets">;
                              if (!draggedId || draggedId === ticket._id) {
                                return;
                              }
                              const dropPosition = getCardDropPosition(event);
                              await moveTicketToStatus(
                                draggedId,
                                status,
                                ticket._id,
                                dropPosition
                              );
                              clearDragState();
                            }}
                            onDragHandleEnd={() => {
                              finishDragSession();
                            }}
                            onClick={(event) => handleCardClick(event, ticket._id)}
                            onKeyDown={(event) => handleCardKeyDown(event, ticket._id)}
                            onPrefetch={() => prefetchTicketDetail(ticket._id)}
                            onStatusChange={(newStatus) =>
                              handleStatusChange(ticket._id, newStatus)
                            }
                            onArchiveToggle={() =>
                              updateTicket({
                                id: ticket._id,
                                archived: !(ticket.archived ?? false),
                              })
                            }
                            onDelete={() => handleDelete(ticket._id)}
                            showDispatchButton
                            dispatchExecutionBadgeLabel={executionBadgeLabel}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
            </section>
          );
        })}
      </div>

    </div>
  );
}
