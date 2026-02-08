"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IssueStatus } from "@/components/issue-status";
import { TicketCard } from "@/components/ticket-card";
import { useSession } from "@/lib/auth-client";

type Ticket = Doc<"tickets">;
type Status = IssueStatus;

type OptimisticOwner = {
  ownerId?: string;
  ownerType?: "user" | "agent";
  ownerDisplayName?: string;
};

interface KanbanBoardProps {
  workspaceId: Id<"workspaces">;
  tickets: Ticket[];
  workspacePrefix: string;
  compact?: boolean;
}

const getOrderValue = (ticket: Ticket) => ticket.order ?? ticket.createdAt;
const STATUS_COLUMNS: Status[] = ["unclaimed", "in_progress", "done"];
const STATUS_META: Record<Status, { label: string; accent: string }> = {
  unclaimed: { label: "UNCLAIMED", accent: "#FF3B00" },
  in_progress: { label: "IN PROGRESS", accent: "#FFB800" },
  done: { label: "DONE", accent: "#00FF94" },
};

export function KanbanBoard({ workspaceId, tickets, workspacePrefix }: KanbanBoardProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const userProfile = useQuery(
    api.userProfiles.getByAuthId,
    userId ? { betterAuthUserId: userId } : "skip"
  );

  const showArchived = false;
  const [dragOverTicketId, setDragOverTicketId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"above" | "below" | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const draggedTicketRef = useRef<{ id: Id<"tickets">; status: Status } | null>(null);

  const moveTicket = useMutation(api.tickets.move);
  const assignTicket = useMutation(api.tickets.assign);
  const updateTicket = useMutation(api.tickets.update);
  const deleteTicket = useMutation(api.tickets.remove);

  const [optimisticMoves, setOptimisticMoves] = useState<
    Map<string, { status: Status; order: number }>
  >(new Map());
  const [optimisticOwners, setOptimisticOwners] = useState<Map<string, OptimisticOwner | null>>(
    new Map()
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

  const visibleTickets = useMemo(() => {
    const base = showArchived ? tickets : tickets.filter((ticket) => !(ticket.archived ?? false));
    if (!resolvedOptimisticMoves.size && !resolvedOptimisticOwners.size) return base;

    return base.map((ticket) => {
      const moveOverride = resolvedOptimisticMoves.get(ticket._id);
      const ownerOverride = resolvedOptimisticOwners.get(ticket._id);
      const next = {
        ...ticket,
      };

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
  }, [tickets, showArchived, resolvedOptimisticMoves, resolvedOptimisticOwners]);

  const ticketsById = useMemo(
    () => new Map(tickets.map((ticket) => [ticket._id, ticket])),
    [tickets]
  );

  const ticketsByStatus = useMemo(() => {
    return STATUS_COLUMNS.reduce(
      (acc, status) => {
        acc[status] = visibleTickets
          .filter((ticket) => ticket.status === status)
          .slice()
          .sort((a, b) => getOrderValue(a) - getOrderValue(b));
        return acc;
      },
      {} as Record<Status, Ticket[]>
    );
  }, [visibleTickets]);

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
    const columnTickets = (ticketsByStatus[status] ?? []).filter((ticket) => ticket._id !== draggingId);
    const targetIndex = columnTickets.findIndex((ticket) => ticket._id === targetId);
    if (targetIndex === -1) return null;
    const prevTicket = position === "above" ? columnTickets[targetIndex - 1] : columnTickets[targetIndex];
    const nextTicket = position === "above" ? columnTickets[targetIndex] : columnTickets[targetIndex + 1];

    if (prevTicket && nextTicket) {
      return (getOrderValue(prevTicket) + getOrderValue(nextTicket)) / 2;
    }
    if (!prevTicket && nextTicket) {
      return getOrderValue(nextTicket) - 1000;
    }
    if (prevTicket && !nextTicket) {
      return getOrderValue(prevTicket) + 1000;
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

  const handleStatusChange = async (ticketId: Id<"tickets">, newStatus: Status) => {
    const columnTickets = ticketsByStatus[newStatus] ?? [];
    const lastTicket = columnTickets[columnTickets.length - 1];
    const currentTicket = tickets.find((ticket) => ticket._id === ticketId);
    const newOrder = lastTicket
      ? getOrderValue(lastTicket) + 1000
      : currentTicket
      ? getOrderValue(currentTicket)
      : 0;

    applyOptimisticMove(ticketId, newStatus, newOrder);
    if (newStatus === "unclaimed") {
      applyOptimisticOwner(ticketId, null);
    }
    if (currentTicket?.status === "unclaimed" && newStatus === "in_progress" && userId) {
      const displayName = userProfile?.name || userProfile?.email || userId;
      applyOptimisticOwner(ticketId, {
        ownerId: userId,
        ownerType: "user",
        ownerDisplayName: displayName,
      });
    }

    try {
      await moveTicket({ id: ticketId, status: newStatus, order: newOrder });
      if (currentTicket) {
        await applyStatusSideEffects(ticketId, currentTicket.status, newStatus);
      }
    } catch (error) {
      clearOptimisticMove(ticketId);
      clearOptimisticOwner(ticketId);
      console.error(error);
    }
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this issue and its sub-issues?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const handleDragStart = (event: React.DragEvent<HTMLElement>, ticketId: Id<"tickets">) => {
    const ticket = tickets.find((t) => t._id === ticketId);
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
    <div className="flex h-full min-h-0 overflow-hidden">
      {STATUS_COLUMNS.map((status, index) => {
        const statusMeta = STATUS_META[status];
        const countLabel = (ticketsByStatus[status]?.length ?? 0).toString().padStart(2, "0");

        return (
          <section
            key={status}
            className={`flex min-h-0 flex-1 flex-col border-[#222] ${
              index < STATUS_COLUMNS.length - 1 ? "border-r" : ""
            } ${dragOverStatus === status ? "bg-white/[0.02]" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverStatus(status);
            }}
            onDragLeave={() => setDragOverStatus(null)}
            onDrop={async (event) => {
              event.preventDefault();
              const ticketId = event.dataTransfer.getData("application/x-ticket-id") as Id<"tickets">;
              if (!ticketId) return;

              const originalStatus = draggedTicketRef.current?.status;
              const shouldAutoAssign =
                originalStatus === "unclaimed" &&
                status === "in_progress" &&
                Boolean(userId);
              const shouldClearOwner = status === "unclaimed";
              if (shouldAutoAssign && userId) {
                const displayName = userProfile?.name || userProfile?.email || userId;
                applyOptimisticOwner(ticketId, {
                  ownerId: userId,
                  ownerType: "user",
                  ownerDisplayName: displayName,
                });
              }

              try {
                if (dragOverTicketId && dragOverPosition && dragOverTicketId !== ticketId) {
                  const order = calculateDropOrder(status, dragOverTicketId, dragOverPosition, ticketId);
                  if (order === null) return;
                  applyOptimisticMove(ticketId, status, order);
                  if (shouldClearOwner) {
                    applyOptimisticOwner(ticketId, null);
                  }
                  await moveTicket({ id: ticketId, status, order });
                } else {
                  const columnTickets = ticketsByStatus[status] ?? [];
                  const lastTicket = columnTickets[columnTickets.length - 1];
                  const draggedTicket = tickets.find((ticket) => ticket._id === ticketId);
                  const order = lastTicket
                    ? getOrderValue(lastTicket) + 1000
                    : draggedTicket
                    ? getOrderValue(draggedTicket)
                    : 0;
                  applyOptimisticMove(ticketId, status, order);
                  if (shouldClearOwner) {
                    applyOptimisticOwner(ticketId, null);
                  }
                  await moveTicket({ id: ticketId, status, order });
                }

                if (originalStatus) {
                  await applyStatusSideEffects(ticketId, originalStatus, status);
                }
              } catch (error) {
                clearOptimisticMove(ticketId);
                clearOptimisticOwner(ticketId);
                console.error(error);
              } finally {
                draggedTicketRef.current = null;
                setDragOverTicketId(null);
                setDragOverPosition(null);
                setDragOverStatus(null);
              }
            }}
          >
            <div
              className="flex items-end justify-between border-b-2 px-4 pb-3 pt-4 md:px-5"
              style={{ borderBottomColor: statusMeta.accent }}
            >
              <span className="font-mono text-[21px] font-extrabold tracking-[0.2em] text-white">
                {statusMeta.label}
              </span>
              <span className="font-mono text-[40px] font-black leading-none" style={{ color: statusMeta.accent }}>
                {countLabel}
              </span>
            </div>

            <ScrollArea className="kb-scroll h-full px-3 py-3">
              <div className="space-y-2.5 pb-4">
                {(ticketsByStatus[status] ?? []).map((ticket) => {
                  const parentTicket = ticket.parentId ? ticketsById.get(ticket.parentId) : null;

                  return (
                    <TicketCard
                      key={ticket._id}
                      ticket={ticket}
                      workspaceId={workspaceId}
                      workspacePrefix={workspacePrefix}
                      parentTicket={parentTicket}
                      accent={statusMeta.accent}
                      isDragOver={dragOverTicketId === ticket._id}
                      onDragStart={(event) => handleDragStart(event, ticket._id)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const offset = event.clientY - rect.top;
                        const position = offset < rect.height / 2 ? "above" : "below";
                        setDragOverTicketId(ticket._id);
                        setDragOverPosition(position);
                      }}
                      onDragLeave={() => {
                        setDragOverTicketId(null);
                        setDragOverPosition(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const draggedId = event.dataTransfer.getData("application/x-ticket-id") as Id<"tickets">;
                        if (!draggedId || draggedId === ticket._id) return;
                        if (!dragOverPosition) return;
                        const originalStatus =
                          draggedTicketRef.current?.id === draggedId
                            ? draggedTicketRef.current.status
                            : tickets.find((entry) => entry._id === draggedId)?.status;
                        const shouldAutoAssign =
                          originalStatus === "unclaimed" &&
                          status === "in_progress" &&
                          Boolean(userId);
                        if (shouldAutoAssign && userId) {
                          const displayName = userProfile?.name || userProfile?.email || userId;
                          applyOptimisticOwner(draggedId, {
                            ownerId: userId,
                            ownerType: "user",
                            ownerDisplayName: displayName,
                          });
                        }
                        if (status === "unclaimed") {
                          applyOptimisticOwner(draggedId, null);
                        }
                        const order = calculateDropOrder(status, ticket._id, dragOverPosition, draggedId);
                        if (order === null) return;
                        applyOptimisticMove(draggedId, status, order);
                        moveTicket({ id: draggedId, status, order })
                          .then(async () => {
                            if (originalStatus) {
                              await applyStatusSideEffects(draggedId, originalStatus, status);
                            }
                          })
                          .catch((error) => {
                            clearOptimisticMove(draggedId);
                            clearOptimisticOwner(draggedId);
                            console.error(error);
                          });
                        setDragOverTicketId(null);
                        setDragOverPosition(null);
                      }}
                      onDragHandleEnd={() => {
                        setDragOverTicketId(null);
                        setDragOverPosition(null);
                        setDragOverStatus(null);
                      }}
                      onClick={(event) => handleCardClick(event, ticket._id)}
                      onKeyDown={(event) => handleCardKeyDown(event, ticket._id)}
                      onStatusChange={(newStatus) => handleStatusChange(ticket._id, newStatus)}
                      onArchiveToggle={() =>
                        updateTicket({
                          id: ticket._id,
                          archived: !(ticket.archived ?? false),
                        })
                      }
                      onDelete={() => handleDelete(ticket._id)}
                    />
                  );
                })}
              </div>
            </ScrollArea>
          </section>
        );
      })}
    </div>
  );
}
