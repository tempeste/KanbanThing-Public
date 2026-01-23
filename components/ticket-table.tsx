"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Archive,
  ArchiveRestore,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  GripVertical,
  MoreVertical,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTicketNumber } from "@/lib/utils";

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

interface TicketTableProps {
  workspaceId: Id<"workspaces">;
  tickets: Ticket[];
  workspacePrefix: string;
}

const getOrderValue = (ticket: Ticket) => ticket.order ?? ticket.createdAt;

export function TicketTable({ workspaceId, tickets, workspacePrefix }: TicketTableProps) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragOverId, setDragOverId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<
    "above" | "below" | "inside" | null
  >(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    Map<string, { parentId: Id<"tickets"> | null; order: number }>
  >(new Map());

  const updateStatus = useMutation(api.tickets.updateStatus);
  const updateTicket = useMutation(api.tickets.update);
  const deleteTicket = useMutation(api.tickets.remove);

  const mergedTickets = useMemo(() => {
    if (!optimisticMoves.size) return tickets;
    return tickets.map((ticket) => {
      const override = optimisticMoves.get(ticket._id);
      if (!override) return ticket;
      return {
        ...ticket,
        parentId: override.parentId,
        order: override.order,
      };
    });
  }, [tickets, optimisticMoves]);

  const visibleTickets = useMemo(() => {
    if (showArchived) return mergedTickets;
    return mergedTickets.filter((ticket) => !(ticket.archived ?? false));
  }, [mergedTickets, showArchived]);

  const ticketsById = useMemo(
    () => new Map(visibleTickets.map((ticket) => [ticket._id, ticket])),
    [visibleTickets]
  );

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

  const buildTree = () => {
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
  };

  const treeRows = useMemo(() => buildTree(), [childrenByParent, collapsed]);

  useEffect(() => {
    if (!optimisticMoves.size) return;
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      for (const ticket of tickets) {
        const override = next.get(ticket._id);
        if (!override) continue;
        const currentOrder = ticket.order ?? ticket.createdAt;
        if (
          ticket.parentId === override.parentId &&
          currentOrder === override.order
        ) {
          next.delete(ticket._id);
        }
      }
      return next;
    });
  }, [tickets, optimisticMoves.size]);

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

  const handleDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    targetTicket: Ticket
  ) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("application/x-ticket-id") as Id<"tickets">;
    if (!draggedId || draggedId === targetTicket._id) return;

    if (isDescendant(draggedId, targetTicket._id)) return;

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
      if (!order) return;
      applyOptimisticMove(draggedId, nextParentId, order);
      await updateTicket({ id: draggedId, parentId: nextParentId, order });
    }

    setDragOverId(null);
    setDragOverPosition(null);
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
      router.push(`/workspace/${workspaceId}/tickets/${ticketId}`);
    },
    [router, workspaceId]
  );

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      router.push(`/workspace/${workspaceId}/tickets/${ticketId}`);
    },
    [router, workspaceId]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Issue List</h2>
          <p className="text-sm text-muted-foreground">
            Drag to reorder, or drop onto an issue to nest it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href={`/workspace/${workspaceId}/tickets/new`}>
              <Plus className="w-4 h-4 mr-2" />
              New Issue
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setShowArchived((prev) => !prev)}>
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card/50">
        <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_140px_160px_120px] gap-4 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
          <div>Issue</div>
          <div>Status</div>
          <div>Owner</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y">
          {treeRows.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground">No issues yet.</div>
          )}
          {treeRows.map(({ ticket, depth }) => {
            const hasChildren = (ticket.childCount ?? 0) > 0;
            const isCollapsed = collapsed.has(ticket._id);
            const statusConfig = STATUS_CONFIG[ticket.status];
            const ticketNumber = formatTicketNumber(workspacePrefix, ticket.number);
            const parentTicket = ticket.parentId ? ticketsById.get(ticket.parentId) : null;
            const progressTotal = ticket.childCount ?? 0;
            const progressDone = ticket.childDoneCount ?? 0;
            const dragClass =
              dragOverId === ticket._id
                ? dragOverPosition === "inside"
                  ? "bg-accent/30 ring-1 ring-primary/30"
                  : dragOverPosition === "above"
                  ? "border-t-2 border-primary/60"
                  : "border-b-2 border-primary/60"
                : "";

            return (
              <div
                key={ticket._id}
                className={`flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-accent/20 md:grid md:grid-cols-[minmax(0,1fr)_140px_160px_120px] md:items-center ${dragClass}`}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(event) => handleDragStart(event, ticket._id)}
                onClick={(event) => handleRowClick(event, ticket._id)}
                onKeyDown={(event) => handleRowKeyDown(event, ticket._id)}
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
              >
                <div className="relative flex items-start gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
                  {depth > 0 && (
                    <>
                      <span
                        className="absolute top-2 bottom-2 w-px bg-border/50"
                        style={{ left: `${Math.max(depth * 16 - 8, 0)}px` }}
                      />
                      <span
                        className="absolute top-1/2 h-px w-3 bg-border/50"
                        style={{ left: `${Math.max(depth * 16 - 8, 0)}px` }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    className="mt-0.5 text-muted-foreground hover:text-foreground"
                    draggable
                    onDragStart={(event) => {
                      handleDragStart(event, ticket._id);
                    }}
                  >
                    <GripVertical className="w-4 h-4" />
                  </button>
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(ticket._id)}
                      className="mt-0.5 text-muted-foreground hover:text-foreground"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  ) : (
                    <span className="mt-0.5 w-4" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        {ticketNumber ?? "—"}
                      </span>
                      <Link
                        href={`/workspace/${workspaceId}/tickets/${ticket._id}`}
                        className="font-medium hover:text-primary"
                      >
                        {ticket.title}
                      </Link>
                    </div>
                    {parentTicket && (
                      <div className="text-xs text-muted-foreground">
                        Sub-issue of{" "}
                        <span className="font-mono">
                          {formatTicketNumber(workspacePrefix, parentTicket.number) ?? "—"}
                        </span>{" "}
                        · {parentTicket.title}
                      </div>
                    )}
                    {progressTotal > 0 && (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {progressDone}/{progressTotal} sub-issues
                      </Badge>
                    )}
                    {ticket.archived && (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        Archived
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground md:hidden">Status</span>
                  <Badge variant="outline" className={`gap-1 ${statusConfig.colorClass}`}>
                    {statusConfig.icon}
                    {statusConfig.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground md:hidden">Owner</span>
                  {ticket.ownerId ? (
                    <span className="inline-flex items-center gap-1 text-sm">
                      {ticket.ownerType === "agent" ? (
                        <Bot className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <User className="w-3 h-3 text-muted-foreground" />
                      )}
                      {ticket.ownerId}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 md:justify-end">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/workspace/${workspaceId}/tickets/new?parentId=${ticket._id}`}>
                      <Plus className="w-3 h-3 mr-1" />
                      Sub-issue
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                        <DropdownMenuItem
                          key={status}
                          onClick={() => updateStatus({
                            id: ticket._id,
                            status: status as Status,
                          })}
                        >
                          Move to {config.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          updateTicket({
                            id: ticket._id,
                            archived: !(ticket.archived ?? false),
                          })
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
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(ticket._id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
