"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Archive,
  ArchiveRestore,
  Bot,
  CheckCircle2,
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
    icon: <Circle className="w-4 h-4" />,
    colorClass: "bg-unclaimed/20 text-unclaimed border-unclaimed/30",
  },
  in_progress: {
    label: "In Progress",
    icon: <Clock className="w-4 h-4" />,
    colorClass: "bg-in-progress/20 text-in-progress border-in-progress/30",
  },
  done: {
    label: "Done",
    icon: <CheckCircle2 className="w-4 h-4" />,
    colorClass: "bg-done/20 text-done border-done/30",
  },
} as const;

type Ticket = Doc<"tickets">;

type Status = "unclaimed" | "in_progress" | "done";

interface KanbanBoardProps {
  workspaceId: Id<"workspaces">;
  tickets: Ticket[];
  workspacePrefix: string;
}

const getOrderValue = (ticket: Ticket) => ticket.order ?? ticket.createdAt;

export function KanbanBoard({ workspaceId, tickets, workspacePrefix }: KanbanBoardProps) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [dragOverTicketId, setDragOverTicketId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"above" | "below" | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);

  const moveTicket = useMutation(api.tickets.move);
  const updateTicket = useMutation(api.tickets.update);
  const deleteTicket = useMutation(api.tickets.remove);

  const columns: Status[] = ["unclaimed", "in_progress", "done"];

  const [optimisticMoves, setOptimisticMoves] = useState<
    Map<string, { status: Status; order: number }>
  >(new Map());

  const visibleTickets = useMemo(() => {
    const base = showArchived ? tickets : tickets.filter((ticket) => !(ticket.archived ?? false));
    if (!optimisticMoves.size) return base;
    return base.map((ticket) => {
      const override = optimisticMoves.get(ticket._id);
      if (!override) return ticket;
      return {
        ...ticket,
        status: override.status,
        order: override.order,
      };
    });
  }, [tickets, showArchived, optimisticMoves]);

  const ticketsById = useMemo(
    () => new Map(tickets.map((ticket) => [ticket._id, ticket])),
    [tickets]
  );

  const ticketsByStatus = useMemo(() => {
    return columns.reduce(
      (acc, status) => {
        acc[status] = visibleTickets
          .filter((ticket) => ticket.status === status)
          .slice()
          .sort((a, b) => getOrderValue(a) - getOrderValue(b));
        return acc;
      },
      {} as Record<Status, Ticket[]>
    );
  }, [columns, visibleTickets]);

  useEffect(() => {
    if (!optimisticMoves.size) return;
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      for (const ticket of tickets) {
        const override = next.get(ticket._id);
        if (!override) continue;
        const currentOrder = ticket.order ?? ticket.createdAt;
        if (ticket.status === override.status && currentOrder === override.order) {
          next.delete(ticket._id);
        }
      }
      return next;
    });
  }, [tickets, optimisticMoves.size]);

  const applyOptimisticMove = (ticketId: Id<"tickets">, status: Status, order: number) => {
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      next.set(ticketId, { status, order });
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

  const handleStatusChange = async (ticketId: Id<"tickets">, newStatus: Status) => {
    const columnTickets = ticketsByStatus[newStatus] ?? [];
    const lastTicket = columnTickets[columnTickets.length - 1];
    const fallbackTicket = tickets.find((ticket) => ticket._id === ticketId);
    const newOrder = lastTicket
      ? getOrderValue(lastTicket) + 1000
      : fallbackTicket
      ? getOrderValue(fallbackTicket)
      : 0;
    applyOptimisticMove(ticketId, newStatus, newOrder);
    try {
      await moveTicket({ id: ticketId, status: newStatus, order: newOrder });
    } catch (error) {
      setOptimisticMoves((prev) => {
        const next = new Map(prev);
        next.delete(ticketId);
        return next;
      });
      console.error(error);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Board</h2>
          <p className="text-sm text-muted-foreground">
            All issues, including sub-issues. Use list view to reparent.
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

      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((status) => {
          const config = STATUS_CONFIG[status];
          return (
            <div
              key={status}
              className={`rounded-xl border bg-card/40 ${
                dragOverStatus === status ? "ring-2 ring-primary/40" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverStatus(status);
              }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={async (event) => {
                event.preventDefault();
                const ticketId = event.dataTransfer.getData("application/x-ticket-id") as Id<"tickets">;
                if (!ticketId) return;
                if (dragOverTicketId && dragOverPosition && dragOverTicketId !== ticketId) {
                  const order = calculateDropOrder(
                    status,
                    dragOverTicketId,
                    dragOverPosition,
                    ticketId
                  );
                  if (!order) return;
                  applyOptimisticMove(ticketId, status, order);
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
                  await moveTicket({ id: ticketId, status, order });
                }
                setDragOverTicketId(null);
                setDragOverPosition(null);
                setDragOverStatus(null);
              }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background/30">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium border ${config.colorClass}`}>
                    {config.icon}
                    {config.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ticketsByStatus[status]?.length ?? 0}
                  </span>
                </div>
              </div>
              <ScrollArea className="h-[calc(100vh-240px)] px-3 py-3">
                <div className="space-y-3">
                  {(ticketsByStatus[status] ?? []).map((ticket) => {
                    const ticketNumber = formatTicketNumber(workspacePrefix, ticket.number);
                    const progressTotal = ticket.childCount ?? 0;
                    const progressDone = ticket.childDoneCount ?? 0;
                    const parentTicket = ticket.parentId
                      ? ticketsById.get(ticket.parentId)
                      : null;

                    return (
                      <Card
                        key={ticket._id}
                        className={`group relative rounded-lg border border-border/60 bg-background/40 p-3 shadow-sm transition hover:border-primary/40 hover:bg-accent/30 ${
                          dragOverTicketId === ticket._id
                            ? "border-primary/40 shadow-md"
                            : ""
                        }`}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(event) => handleDragStart(event, ticket._id)}
                        onClick={(event) => handleCardClick(event, ticket._id)}
                        onKeyDown={(event) => handleCardKeyDown(event, ticket._id)}
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
                          const order = calculateDropOrder(status, ticket._id, dragOverPosition, draggedId);
                          if (!order) return;
                          applyOptimisticMove(draggedId, status, order);
                          moveTicket({ id: draggedId, status, order });
                          setDragOverTicketId(null);
                          setDragOverPosition(null);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              className="mt-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
                              draggable
                              onDragStart={(event) => {
                                handleDragStart(event, ticket._id);
                              }}
                              onDragEnd={() => {
                                setDragOverTicketId(null);
                                setDragOverPosition(null);
                                setDragOverStatus(null);
                              }}
                            >
                              <GripVertical className="w-4 h-4" />
                            </button>
                            <div className="min-w-0">
                              <Link
                                href={`/workspace/${workspaceId}/tickets/${ticket._id}`}
                                className="flex flex-wrap items-center gap-2 font-medium hover:text-primary text-sm"
                              >
                                <span className="font-mono text-xs text-muted-foreground">
                                  {ticketNumber ?? "—"}
                                </span>
                                {ticket.title}
                              </Link>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                              {parentTicket && (
                                <div className="mt-2 text-[11px] text-muted-foreground">
                                  Sub-issue of{" "}
                                  <span className="font-mono">
                                    {formatTicketNumber(workspacePrefix, parentTicket.number) ?? "—"}
                                  </span>{" "}
                                  · {parentTicket.title}
                                </div>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {columns.map((nextStatus) => (
                                <DropdownMenuItem
                                  key={nextStatus}
                                  onClick={() => handleStatusChange(ticket._id, nextStatus)}
                                >
                                  Move to {STATUS_CONFIG[nextStatus].label}
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

                        {ticket.description && (
                          <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                            {ticket.description}
                          </p>
                        )}

                        <div className="mt-4 flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/workspace/${workspaceId}/tickets/${ticket._id}`}>
                              Open
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={`/workspace/${workspaceId}/tickets/new?parentId=${ticket._id}`}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Sub-issue
                            </Link>
                          </Button>
                          {ticket.ownerId && (
                            <Badge variant="outline" className="ml-auto gap-1 text-xs">
                              {ticket.ownerType === "agent" ? (
                                <Bot className="w-3 h-3" />
                              ) : (
                                <User className="w-3 h-3" />
                              )}
                              {ticket.ownerId}
                            </Badge>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
}
