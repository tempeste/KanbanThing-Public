"use client";

import Link from "next/link";
import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { TicketTableRow } from "@/components/ticket-table-row";
import { IssueStatus } from "@/components/issue-status";

type Ticket = Doc<"tickets">;

interface TicketTableProps {
  workspaceId: Id<"workspaces">;
  tickets: Ticket[];
  workspacePrefix: string;
  compact?: boolean;
}

const getOrderValue = (ticket: Ticket) => ticket.order ?? ticket.createdAt;

export function TicketTable({ workspaceId, tickets, workspacePrefix }: TicketTableProps) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragOverId, setDragOverId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"above" | "below" | "inside" | null>(
    null
  );
  const [optimisticMoves, setOptimisticMoves] = useState<
    Map<string, { parentId: Id<"tickets"> | null; order: number }>
  >(new Map());
  const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, IssueStatus>>(new Map());
  const [optimisticArchived, setOptimisticArchived] = useState<Map<string, boolean>>(new Map());

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
        ownerDisplayName: statusOverride === "unclaimed" ? undefined : ticket.ownerDisplayName,
      };
    });
  }, [tickets, resolvedOptimisticMoves, resolvedOptimisticStatuses, resolvedOptimisticArchived]);

  const visibleTickets = useMemo(() => {
    if (showArchived) return mergedTickets;

    const ticketById = new Map(mergedTickets.map((ticket) => [ticket._id, ticket]));
    const hasArchivedAncestor = (ticket: Ticket) => {
      let currentParentId = ticket.parentId ?? null;
      while (currentParentId) {
        const parent = ticketById.get(currentParentId);
        if (!parent) return false;
        if (parent.archived ?? false) return true;
        currentParentId = parent.parentId ?? null;
      }
      return false;
    };

    return mergedTickets.filter(
      (ticket) => !(ticket.archived ?? false) && !hasArchivedAncestor(ticket)
    );
  }, [mergedTickets, showArchived]);

  const ticketsById = useMemo(() => new Map(visibleTickets.map((ticket) => [ticket._id, ticket])), [visibleTickets]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const ticket of visibleTickets) {
      const hasVisibleParent = ticket.parentId ? ticketsById.has(ticket.parentId) : false;
      const key = hasVisibleParent ? ticket.parentId! : "root";
      const list = map.get(key) ?? [];
      list.push(ticket);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => getOrderValue(a) - getOrderValue(b));
    }
    return map;
  }, [visibleTickets, ticketsById]);

  const treeRows = useMemo(() => {
    const result: Array<{ ticket: Ticket; depth: number }> = [];
    const visit = (ticket: Ticket, depth: number) => {
      result.push({ ticket, depth });
      if (collapsed.has(ticket._id)) return;
      const children = childrenByParent.get(ticket._id) ?? [];
      for (const child of children) {
        visit(child, depth + 1);
      }
    };
    const roots = childrenByParent.get("root") ?? [];
    for (const root of roots) {
      visit(root, 0);
    }
    return result;
  }, [childrenByParent, collapsed]);

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
    siblings: Ticket[],
    targetId: Id<"tickets">,
    position: "above" | "below",
    draggingId: Id<"tickets">
  ) => {
    const list = siblings.filter((ticket) => ticket._id !== draggingId);
    const targetIndex = list.findIndex((ticket) => ticket._id === targetId);
    if (targetIndex === -1) return null;
    const prevTicket = position === "above" ? list[targetIndex - 1] : list[targetIndex];
    const nextTicket = position === "above" ? list[targetIndex] : list[targetIndex + 1];

    if (prevTicket && nextTicket) {
      return (getOrderValue(prevTicket) + getOrderValue(nextTicket)) / 2;
    }
    if (!prevTicket && nextTicket) {
      return getOrderValue(nextTicket) - 1000;
    }
    if (prevTicket && !nextTicket) {
      return getOrderValue(prevTicket) + 1000;
    }
    return list.length ? getOrderValue(list[list.length - 1]) + 1000 : 0;
  };

  const applyOptimisticMove = (ticketId: Id<"tickets">, parentId: Id<"tickets"> | null, order: number) => {
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

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>, targetTicket: Ticket) => {
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
          ? getOrderValue(lastTicket) + 1000
          : draggedTicket
          ? getOrderValue(draggedTicket)
          : 0;
        applyOptimisticMove(draggedId, targetTicket._id, order);
        await updateTicket({ id: draggedId, parentId: targetTicket._id, order });
      } else if (dragOverPosition === "above" || dragOverPosition === "below") {
        const nextParentId = targetTicket.parentId ?? null;
        const siblings = childrenByParent.get(nextParentId ?? "root") ?? [];
        const order = calculateOrder(siblings, targetTicket._id, dragOverPosition, draggedId);
        if (order === null) return;
        applyOptimisticMove(draggedId, nextParentId, order);
        await updateTicket({ id: draggedId, parentId: nextParentId, order });
      }
    } catch (error) {
      clearOptimisticMove(draggedId);
      console.error(error);
    }

    setDragOverId(null);
    setDragOverPosition(null);
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this issue and its sub-issues?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const handleDragStart = (event: React.DragEvent<HTMLElement>, ticketId: Id<"tickets">) => {
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
    <div className="kb-scroll h-full overflow-auto">
      <div className="sticky top-0 z-10 hidden border-b-2 border-[#222] bg-[#0d0d0d] px-7 py-2 md:grid md:grid-cols-[90px_minmax(0,1fr)_170px_120px_110px] md:items-center">
        {["ID", "TITLE", "ASSIGNEE", "STATUS", "ACTIONS"].map((header) => (
          <span
            key={header}
            className={`font-mono text-[9px] font-extrabold tracking-[0.2em] text-[#444] ${
              header === "ACTIONS" ? "text-right" : ""
            }`}
          >
            {header}
          </span>
        ))}
      </div>

      <div className="divide-y divide-[#1a1a1a]">
        {treeRows.length === 0 && (
          <div className="px-7 py-10 font-mono text-xs uppercase tracking-[0.12em] text-[#666]">No issues yet.</div>
        )}

        {treeRows.map(({ ticket, depth }) => {
          const hasChildren = (ticket.childCount ?? 0) > 0;
          const isCollapsed = collapsed.has(ticket._id);
          const parentTicket = ticket.parentId ? ticketsById.get(ticket.parentId) : null;
          const dragClass =
            dragOverId === ticket._id
              ? dragOverPosition === "inside"
                ? "bg-[#171717]"
                : dragOverPosition === "above"
                ? "border-t-2 border-t-[#FF3B00]"
                : "border-b-2 border-b-[#FF3B00]"
              : "";

          return (
            <TicketTableRow
              key={ticket._id}
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
                const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                const offset = event.clientY - rect.top;
                const threshold = rect.height * 0.25;
                let position: "above" | "below" | "inside" = "inside";
                if (offset < threshold) position = "above";
                else if (offset > rect.height - threshold) position = "below";
                setDragOverId(ticket._id);
                setDragOverPosition(position);
              }}
              onDragLeave={() => {
                setDragOverId(null);
                setDragOverPosition(null);
              }}
              onDrop={(event) => handleDrop(event, ticket)}
              onClick={(event) => handleRowClick(event, ticket._id)}
              onKeyDown={(event) => handleRowKeyDown(event, ticket._id)}
              onStatusChange={(status) => handleStatusChange(ticket._id, status)}
              onArchiveToggle={() => handleArchiveToggle(ticket._id, !(ticket.archived ?? false))}
              onDelete={() => handleDelete(ticket._id)}
            />
          );
        })}
      </div>

      <div className="px-7 py-3">
        <Link
          href={`/workspace/${workspaceId}/tickets/new?tab=list`}
          className="inline-flex border border-[#333] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#666] transition hover:border-[#555] hover:text-[#bbb]"
        >
          New Issue
        </Link>
        <button
          type="button"
          onClick={() => setShowArchived((prev) => !prev)}
          className="ml-2 inline-flex border border-[#333] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#666] transition hover:border-[#555] hover:text-[#bbb]"
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </button>
      </div>
    </div>
  );
}
