"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { IssueStatus } from "@/components/issue-status";
import { TicketCard } from "@/components/ticket-card";
import { useSession } from "@/lib/auth-client";
import {
  deriveTicketsByStatus,
  deriveVisibleTickets,
  getTicketOrderValue,
} from "@/lib/ticket-derivations";
import { TicketSummary } from "@/lib/ticket-summary";

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
  compact?: boolean;
}

const STATUS_COLUMNS: Status[] = ["unclaimed", "in_progress", "done"];
const STATUS_META: Record<Status, { label: string; accent: string }> = {
  unclaimed: { label: "UNCLAIMED", accent: "var(--unclaimed)" },
  in_progress: { label: "IN PROGRESS", accent: "var(--in-progress)" },
  done: { label: "DONE", accent: "var(--done)" },
};

type DragOverPosition = "above" | "below" | null;

export function KanbanBoard({
  workspaceId,
  tickets,
  workspacePrefix,
  showArchived,
}: KanbanBoardProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const userProfile = useQuery(
    api.userProfiles.getByAuthId,
    userId ? { betterAuthUserId: userId } : "skip"
  );

  const [dragOverTicketId, setDragOverTicketId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<DragOverPosition>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
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

  const unclaimedColumnRef = useRef<HTMLDivElement | null>(null);
  const inProgressColumnRef = useRef<HTMLDivElement | null>(null);
  const doneColumnRef = useRef<HTMLDivElement | null>(null);

  const moveTicket = useMutation(api.tickets.move);
  const assignTicket = useMutation(api.tickets.assign);
  const updateTicket = useMutation(api.tickets.update);
  const deleteTicket = useMutation(api.tickets.remove);

  const allTicketsById = useMemo(
    () => new Map(tickets.map((ticket) => [ticket._id, ticket])),
    [tickets]
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
        const statusUnclaimed = ticket.status === "unclaimed";
        if (ownerCleared || statusUnclaimed) {
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
    () => deriveTicketsByStatus(visibleTickets),
    [visibleTickets]
  );

  const unclaimedVirtualizer = useVirtualizer({
    count: ticketsByStatus.unclaimed.length,
    getScrollElement: () => unclaimedColumnRef.current,
    estimateSize: () => 120,
    overscan: 10,
  });
  const inProgressVirtualizer = useVirtualizer({
    count: ticketsByStatus.in_progress.length,
    getScrollElement: () => inProgressColumnRef.current,
    estimateSize: () => 120,
    overscan: 10,
  });
  const doneVirtualizer = useVirtualizer({
    count: ticketsByStatus.done.length,
    getScrollElement: () => doneColumnRef.current,
    estimateSize: () => 120,
    overscan: 10,
  });

  const getColumnRef = (status: Status) => {
    if (status === "unclaimed") return unclaimedColumnRef;
    if (status === "in_progress") return inProgressColumnRef;
    return doneColumnRef;
  };

  const getColumnVirtualizer = (status: Status) => {
    if (status === "unclaimed") return unclaimedVirtualizer;
    if (status === "in_progress") return inProgressVirtualizer;
    return doneVirtualizer;
  };

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

    if (nextStatus === "unclaimed") {
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

    if (status === "unclaimed") {
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
    await moveTicketToStatus(ticketId, newStatus);
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this issue and its sub-issues?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const handleDragStart = (event: React.DragEvent<HTMLElement>, ticketId: Id<"tickets">) => {
    const ticket = allTicketsById.get(ticketId);
    if (ticket) {
      draggedTicketRef.current = { id: ticketId, status: ticket.status };
    }
    event.dataTransfer.setData("application/x-ticket-id", ticketId);
    event.dataTransfer.setData("text/plain", ticketId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleCardClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.closest("a,button,select,textarea,input,[role='menuitem']")) return;
      router.push(`/workspace/${workspaceId}/tickets/${ticketId}`);
    },
    [router, workspaceId]
  );

  const handleCardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      router.push(`/workspace/${workspaceId}/tickets/${ticketId}`);
    },
    [router, workspaceId]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="kb-scroll flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto md:snap-none md:overflow-x-hidden">
        {STATUS_COLUMNS.map((status, index) => {
        const statusMeta = STATUS_META[status];
        const countLabel = (ticketsByStatus[status]?.length ?? 0)
          .toString()
          .padStart(2, "0");
        const columnRef = getColumnRef(status);
        const virtualizer = getColumnVirtualizer(status);
        const columnTickets = ticketsByStatus[status] ?? [];

          return (
            <section
            key={status}
            className={`flex min-h-0 min-w-[85vw] shrink-0 snap-center flex-col border-border md:min-w-0 md:flex-1 ${
              index < STATUS_COLUMNS.length - 1 ? "border-r" : ""
            } ${dragOverStatus === status ? "bg-white/[0.02]" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              scheduleDragState({ ticketId: null, position: null, status });
            }}
            onDragLeave={() =>
              scheduleDragState({ ticketId: null, position: null, status: null })
            }
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
                draggedTicketRef.current = null;
                clearDragState();
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

            <div ref={columnRef} className="kb-scroll h-full overflow-auto px-3 py-3">
              {columnTickets.length === 0 && (
                <div className="pt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
                  No issues
                </div>
              )}

              {columnTickets.length > 0 && (
                <div
                  className="relative w-full"
                  style={{ height: `${virtualizer.getTotalSize()}px` }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const ticket = columnTickets[virtualItem.index];
                    const parentTicket = ticket.parentId
                      ? ticketsById.get(ticket.parentId) ?? null
                      : null;

                    return (
                      <div
                        key={ticket._id}
                        ref={virtualizer.measureElement}
                        className="absolute left-0 top-0 w-full pb-1"
                        style={{ transform: `translateY(${virtualItem.start}px)` }}
                      >
                        <TicketCard
                          ticket={ticket}
                          workspaceId={workspaceId}
                          workspacePrefix={workspacePrefix}
                          parentTicket={parentTicket}
                          accent={statusMeta.accent}
                          isDragOver={dragOverTicketId === ticket._id}
                          onDragStart={(event) => handleDragStart(event, ticket._id)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            const rect = (
                              event.currentTarget as HTMLDivElement
                            ).getBoundingClientRect();
                            const offset = event.clientY - rect.top;
                            const position: DragOverPosition =
                              offset < rect.height / 2 ? "above" : "below";
                            scheduleDragState({
                              ticketId: ticket._id,
                              position,
                              status,
                            });
                          }}
                          onDragLeave={() =>
                            scheduleDragState({
                              ticketId: null,
                              position: null,
                              status,
                            })
                          }
                          onDrop={async (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const draggedId = event.dataTransfer.getData(
                              "application/x-ticket-id"
                            ) as Id<"tickets">;
                            if (!draggedId || draggedId === ticket._id || !dragOverPosition) {
                              return;
                            }
                            await moveTicketToStatus(
                              draggedId,
                              status,
                              ticket._id,
                              dragOverPosition
                            );
                            clearDragState();
                          }}
                          onDragHandleEnd={() => clearDragState()}
                          onClick={(event) => handleCardClick(event, ticket._id)}
                          onKeyDown={(event) => handleCardKeyDown(event, ticket._id)}
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
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </section>
          );
        })}
      </div>

    </div>
  );
}
