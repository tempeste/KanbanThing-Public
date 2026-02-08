"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { TicketTableRow } from "@/components/ticket-table-row";
import { IssueStatus } from "@/components/issue-status";
import {
  deriveChildrenByParent,
  deriveTreeRows,
  deriveVisibleTickets,
  getTicketOrderValue,
} from "@/lib/ticket-derivations";
import { TicketSummary } from "@/lib/ticket-summary";

interface TicketTableProps {
  workspaceId: Id<"workspaces">;
  tickets: TicketSummary[];
  workspacePrefix: string;
  showArchived: boolean;
  compact?: boolean;
}

type DragOverPosition = "above" | "below" | "inside" | null;

export function TicketTable({
  workspaceId,
  tickets,
  workspacePrefix,
  showArchived,
}: TicketTableProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragOverId, setDragOverId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<DragOverPosition>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    Map<string, { parentId: Id<"tickets"> | null; order: number }>
  >(new Map());
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Map<string, IssueStatus>
  >(new Map());
  const [optimisticArchived, setOptimisticArchived] = useState<Map<string, boolean>>(
    new Map()
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const pendingDragStateRef = useRef<{
    id: Id<"tickets"> | null;
    position: DragOverPosition;
  } | null>(null);

  const updateStatus = useMutation(api.tickets.updateStatus);
  const updateTicket = useMutation(api.tickets.update);
  const deleteTicket = useMutation(api.tickets.remove);

  const resolvedOptimisticMoves = useMemo(() => {
    if (!optimisticMoves.size) return optimisticMoves;
    const next = new Map(optimisticMoves);
    for (const ticket of tickets) {
      const override = next.get(ticket._id);
      if (!override) continue;
      const currentOrder = ticket.order ?? ticket.createdAt;
      if (ticket.parentId === override.parentId && currentOrder === override.order) {
        next.delete(ticket._id);
      }
    }
    return next;
  }, [optimisticMoves, tickets]);

  const resolvedOptimisticStatuses = useMemo(() => {
    if (!optimisticStatuses.size) return optimisticStatuses;
    const next = new Map(optimisticStatuses);
    for (const ticket of tickets) {
      const status = next.get(ticket._id);
      if (!status) continue;
      if (ticket.status === status) {
        next.delete(ticket._id);
      }
    }
    return next;
  }, [optimisticStatuses, tickets]);

  const resolvedOptimisticArchived = useMemo(() => {
    if (!optimisticArchived.size) return optimisticArchived;
    const next = new Map(optimisticArchived);
    for (const ticket of tickets) {
      const archived = next.get(ticket._id);
      if (archived === undefined) continue;
      if ((ticket.archived ?? false) === archived) {
        next.delete(ticket._id);
      }
    }
    return next;
  }, [optimisticArchived, tickets]);

  const mergedTickets = useMemo(() => {
    if (
      !resolvedOptimisticMoves.size &&
      !resolvedOptimisticStatuses.size &&
      !resolvedOptimisticArchived.size
    ) {
      return tickets;
    }

    return tickets.map((ticket) => {
      const moveOverride = resolvedOptimisticMoves.get(ticket._id);
      const statusOverride = resolvedOptimisticStatuses.get(ticket._id);
      const archivedOverride = resolvedOptimisticArchived.get(ticket._id);

      return {
        ...ticket,
        parentId: moveOverride ? moveOverride.parentId : ticket.parentId,
        order: moveOverride ? moveOverride.order : ticket.order,
        status: statusOverride ?? ticket.status,
        archived: archivedOverride ?? ticket.archived,
        ownerId: statusOverride === "unclaimed" ? undefined : ticket.ownerId,
        ownerType: statusOverride === "unclaimed" ? undefined : ticket.ownerType,
        ownerDisplayName:
          statusOverride === "unclaimed" ? undefined : ticket.ownerDisplayName,
      };
    });
  }, [tickets, resolvedOptimisticMoves, resolvedOptimisticStatuses, resolvedOptimisticArchived]);

  const visibleTickets = useMemo(
    () => deriveVisibleTickets(mergedTickets, showArchived),
    [mergedTickets, showArchived]
  );
  const ticketsById = useMemo(
    () => new Map(visibleTickets.map((ticket) => [ticket._id, ticket])),
    [visibleTickets]
  );
  const childrenByParent = useMemo(
    () => deriveChildrenByParent(visibleTickets),
    [visibleTickets]
  );
  const treeRows = useMemo(
    () => deriveTreeRows(childrenByParent, collapsed),
    [childrenByParent, collapsed]
  );

  const rowVirtualizer = useVirtualizer({
    count: treeRows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 48,
    overscan: 12,
  });

  const flushDragState = useCallback(() => {
    dragRafRef.current = null;
    const next = pendingDragStateRef.current;
    pendingDragStateRef.current = null;
    if (!next) return;
    setDragOverId(next.id);
    setDragOverPosition(next.position);
  }, []);

  const scheduleDragState = useCallback(
    (id: Id<"tickets"> | null, position: DragOverPosition) => {
      pendingDragStateRef.current = { id, position };
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

  const toggleCollapsed = (ticketId: Id<"tickets">) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  };

  const isDescendant = (ancestorId: Id<"tickets">, candidateId: Id<"tickets">) => {
    let current = ticketsById.get(candidateId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = ticketsById.get(current.parentId);
    }
    return false;
  };

  const calculateOrder = (
    siblings: TicketSummary[],
    targetId: Id<"tickets">,
    position: "above" | "below",
    draggingId: Id<"tickets">
  ) => {
    const list = siblings.filter((ticket) => ticket._id !== draggingId);
    const targetIndex = list.findIndex((ticket) => ticket._id === targetId);
    if (targetIndex === -1) return null;
    const prevTicket =
      position === "above" ? list[targetIndex - 1] : list[targetIndex];
    const nextTicket =
      position === "above" ? list[targetIndex] : list[targetIndex + 1];

    if (prevTicket && nextTicket) {
      return (getTicketOrderValue(prevTicket) + getTicketOrderValue(nextTicket)) / 2;
    }
    if (!prevTicket && nextTicket) {
      return getTicketOrderValue(nextTicket) - 1000;
    }
    if (prevTicket && !nextTicket) {
      return getTicketOrderValue(prevTicket) + 1000;
    }
    return list.length ? getTicketOrderValue(list[list.length - 1]) + 1000 : 0;
  };

  const applyOptimisticMove = (
    ticketId: Id<"tickets">,
    parentId: Id<"tickets"> | null,
    order: number
  ) => {
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      next.set(ticketId, { parentId, order });
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

  const clearDragState = () => {
    pendingDragStateRef.current = null;
    setDragOverId(null);
    setDragOverPosition(null);
  };

  const handleDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    targetTicket: TicketSummary
  ) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("application/x-ticket-id") as Id<"tickets">;
    if (!draggedId || draggedId === targetTicket._id) return;
    if (isDescendant(draggedId, targetTicket._id)) return;

    try {
      if (dragOverPosition === "inside") {
        const siblings = childrenByParent.get(targetTicket._id) ?? [];
        const lastTicket = siblings[siblings.length - 1];
        const draggedTicket = ticketsById.get(draggedId);
        const order = lastTicket
          ? getTicketOrderValue(lastTicket) + 1000
          : draggedTicket
            ? getTicketOrderValue(draggedTicket)
            : 0;
        applyOptimisticMove(draggedId, targetTicket._id, order);
        await updateTicket({ id: draggedId, parentId: targetTicket._id, order });
      } else if (dragOverPosition === "above" || dragOverPosition === "below") {
        const nextParentId = targetTicket.parentId ?? null;
        const siblings = childrenByParent.get(nextParentId ?? "root") ?? [];
        const order = calculateOrder(
          siblings,
          targetTicket._id,
          dragOverPosition,
          draggedId
        );
        if (order === null) return;
        applyOptimisticMove(draggedId, nextParentId, order);
        await updateTicket({ id: draggedId, parentId: nextParentId, order });
      }
    } catch (error) {
      clearOptimisticMove(draggedId);
      console.error(error);
    } finally {
      clearDragState();
    }
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this issue and its sub-issues?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLElement>,
    ticketId: Id<"tickets">
  ) => {
    event.dataTransfer.setData("application/x-ticket-id", ticketId);
    event.dataTransfer.setData("text/plain", ticketId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleRowClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.closest("a,button,select,textarea,input,[role='menuitem']")) return;
      router.push(`/workspace/${workspaceId}/tickets/${ticketId}?tab=list`);
    },
    [router, workspaceId]
  );

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      router.push(`/workspace/${workspaceId}/tickets/${ticketId}?tab=list`);
    },
    [router, workspaceId]
  );

  const handleStatusChange = (ticketId: Id<"tickets">, status: IssueStatus) => {
    setOptimisticStatuses((prev) => {
      const next = new Map(prev);
      next.set(ticketId, status);
      return next;
    });

    updateStatus({ id: ticketId, status }).catch((error) => {
      setOptimisticStatuses((prev) => {
        const next = new Map(prev);
        next.delete(ticketId);
        return next;
      });
      console.error(error);
    });
  };

  const handleArchiveToggle = (ticketId: Id<"tickets">, nextArchived: boolean) => {
    setOptimisticArchived((prev) => {
      const next = new Map(prev);
      next.set(ticketId, nextArchived);
      return next;
    });

    updateTicket({ id: ticketId, archived: nextArchived }).catch((error) => {
      setOptimisticArchived((prev) => {
        const next = new Map(prev);
        next.delete(ticketId);
        return next;
      });
      console.error(error);
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="hidden border-b-2 border-border bg-card px-7 py-2 md:grid md:grid-cols-[90px_minmax(0,1fr)_170px_120px_110px] md:items-center">
        {["ID", "TITLE", "ASSIGNEE", "STATUS", "ACTIONS"].map((header) => (
          <span
            key={header}
            className={`font-mono text-[9px] font-extrabold tracking-[0.2em] text-muted-foreground/60 ${
              header === "ACTIONS" ? "text-right" : ""
            }`}
          >
            {header}
          </span>
        ))}
      </div>

      <div ref={listRef} className="kb-scroll min-h-0 flex-1 overflow-auto">
        {treeRows.length === 0 && (
          <div className="px-7 py-10 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            No issues yet.
          </div>
        )}

        {treeRows.length > 0 && (
          <div
            className="relative divide-y divide-border/50"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const { ticket, depth } = treeRows[virtualRow.index];
              const hasChildren = (ticket.childCount ?? 0) > 0;
              const isCollapsed = collapsed.has(ticket._id);
              const parentTicket = ticket.parentId
                ? ticketsById.get(ticket.parentId) ?? null
                : null;
              const dragClass =
                dragOverId === ticket._id
                  ? dragOverPosition === "inside"
                    ? "bg-accent"
                    : dragOverPosition === "above"
                      ? "border-t-2 border-t-primary"
                      : "border-b-2 border-b-primary"
                  : "";

              return (
                <div
                  key={ticket._id}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TicketTableRow
                    ticket={ticket}
                    workspaceId={workspaceId}
                    workspacePrefix={workspacePrefix}
                    parentTicket={parentTicket}
                    depth={depth}
                    hasChildren={hasChildren}
                    isCollapsed={isCollapsed}
                    dragClass={dragClass}
                    onToggleCollapse={() => toggleCollapsed(ticket._id)}
                    onDragStart={(event) => handleDragStart(event, ticket._id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      const rect = (
                        event.currentTarget as HTMLDivElement
                      ).getBoundingClientRect();
                      const offset = event.clientY - rect.top;
                      const threshold = rect.height * 0.25;
                      let position: DragOverPosition = "inside";
                      if (offset < threshold) position = "above";
                      else if (offset > rect.height - threshold) position = "below";
                      scheduleDragState(ticket._id, position);
                    }}
                    onDragLeave={() => scheduleDragState(null, null)}
                    onDrop={(event) => handleDrop(event, ticket)}
                    onClick={(event) => handleRowClick(event, ticket._id)}
                    onKeyDown={(event) => handleRowKeyDown(event, ticket._id)}
                    onStatusChange={(status) => handleStatusChange(ticket._id, status)}
                    onArchiveToggle={() =>
                      handleArchiveToggle(ticket._id, !(ticket.archived ?? false))
                    }
                    onDelete={() => handleDelete(ticket._id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
