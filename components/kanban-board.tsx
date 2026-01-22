"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Clock,
  CheckCircle2,
  Circle,
  User,
  Bot,
  MoreVertical,
  Trash2,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  GripVertical,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TicketModal } from "@/components/ticket-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDocNumber, formatTicketNumber } from "@/lib/utils";

type Ticket = Doc<"tickets">;
type FeatureDoc = Doc<"featureDocs">;
type Status = "unclaimed" | "in_progress" | "done";

const STATUS_CONFIG: Record<Status, { label: string; icon: React.ReactNode; colorClass: string }> = {
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
};

interface KanbanBoardProps {
  workspaceId: Id<"workspaces">;
  tickets: Ticket[];
  featureDocs: FeatureDoc[];
  workspacePrefix: string;
}

export function KanbanBoard({
  workspaceId,
  tickets,
  featureDocs,
  workspacePrefix,
}: KanbanBoardProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const [dragOverTicketId, setDragOverTicketId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"above" | "below" | null>(null);
  const [draggingTicketId, setDraggingTicketId] = useState<Id<"tickets"> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const dragPreviewRef = useRef<string | null>(null);
  const draggingRef = useRef<Id<"tickets"> | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const moveTicket = useMutation(api.tickets.move);
  const updateTicket = useMutation(api.tickets.update);
  const deleteTicket = useMutation(api.tickets.remove);

  const columns: Status[] = ["unclaimed", "in_progress", "done"];
  const getOrder = (ticket: Ticket) => ticket.order ?? ticket.createdAt;
  const [optimisticMoves, setOptimisticMoves] = useState<
    Map<string, { status: Status; order: number }>
  >(new Map());

  const displayTickets = useMemo(() => {
    if (!optimisticMoves.size) return tickets;
    return tickets.map((ticket) => {
      const override = optimisticMoves.get(ticket._id);
      if (!override) return ticket;
      return {
        ...ticket,
        status: override.status,
        order: override.order,
      };
    });
  }, [tickets, optimisticMoves]);

  const isArchived = (ticket: Ticket) => ticket.archived ?? false;

  const visibleTickets = useMemo(() => {
    if (showArchived) return displayTickets;
    return displayTickets.filter((ticket) => !isArchived(ticket));
  }, [displayTickets, showArchived]);

  const ticketsByStatus = useMemo(
    () =>
      columns.reduce(
        (acc, status) => {
          acc[status] = visibleTickets
            .filter((t) => t.status === status)
            .slice()
            .sort((a, b) => getOrder(a) - getOrder(b));
          return acc;
        },
        {} as Record<Status, Ticket[]>
      ),
    [columns, visibleTickets]
  );
  const buildTicketList = (columnTickets: Ticket[]) => {
    const idsInColumn = new Set(columnTickets.map((ticket) => ticket._id));
    const childrenByParent = new Map<Id<"tickets">, Ticket[]>();
    for (const ticket of columnTickets) {
      if (ticket.parentTicketId && idsInColumn.has(ticket.parentTicketId)) {
        const list = childrenByParent.get(ticket.parentTicketId) ?? [];
        list.push(ticket);
        childrenByParent.set(ticket.parentTicketId, list);
      }
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => getOrder(a) - getOrder(b));
    }

    const roots = columnTickets.filter(
      (ticket) => !ticket.parentTicketId || !idsInColumn.has(ticket.parentTicketId)
    );
    roots.sort((a, b) => getOrder(a) - getOrder(b));

    const flattened: Array<{ ticket: Ticket; depth: number }> = [];
    const visit = (ticket: Ticket, depth: number) => {
      flattened.push({ ticket, depth });
      const children = childrenByParent.get(ticket._id);
      if (!children) return;
      for (const child of children) {
        visit(child, depth + 1);
      }
    };

    for (const root of roots) {
      visit(root, 0);
    }
    return flattened;
  };

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
  const docsById = useMemo(
    () => new Map(featureDocs.map((doc) => [doc._id, doc])),
    [featureDocs]
  );

  const applyOptimisticMove = (ticketId: Id<"tickets">, status: Status, order: number) => {
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      next.set(ticketId, { status, order });
      return next;
    });
  };

  const getColumnTickets = (status: Status, excludeId?: Id<"tickets"> | null) => {
    const list = ticketsByStatus[status] ?? [];
    if (!excludeId) return list;
    return list.filter((ticket) => ticket._id !== excludeId);
  };

  const calculateDropOrder = (
    status: Status,
    targetId: Id<"tickets">,
    position: "above" | "below",
    draggingId?: Id<"tickets"> | null
  ) => {
    const columnTickets = getColumnTickets(status, draggingId);
    const targetIndex = columnTickets.findIndex((ticket) => ticket._id === targetId);
    if (targetIndex === -1) return null;
    const prevTicket = position === "above" ? columnTickets[targetIndex - 1] : columnTickets[targetIndex];
    const nextTicket = position === "above" ? columnTickets[targetIndex] : columnTickets[targetIndex + 1];

    if (prevTicket && nextTicket) {
      return (getOrder(prevTicket) + getOrder(nextTicket)) / 2;
    }
    if (!prevTicket && nextTicket) {
      return getOrder(nextTicket) - 1000;
    }
    if (prevTicket && !nextTicket) {
      return getOrder(prevTicket) + 1000;
    }
    return Date.now();
  };

  const handleStatusChange = async (ticketId: Id<"tickets">, newStatus: Status) => {
    const columnTickets = ticketsByStatus[newStatus];
    const lastTicket = columnTickets[columnTickets.length - 1];
    const newOrder = lastTicket ? getOrder(lastTicket) + 1000 : Date.now();
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
    if (confirm("Delete this ticket?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const handleDrop = async (event: React.DragEvent, status: Status) => {
    event.preventDefault();
    const ticketId = (draggingTicketId ||
      event.dataTransfer.getData("text/plain")) as Id<"tickets">;
    if (!ticketId) return;
    const columnTickets = getColumnTickets(status, ticketId);
    const lastTicket = columnTickets[columnTickets.length - 1];
    const newOrder = lastTicket ? getOrder(lastTicket) + 1000 : Date.now();
    applyOptimisticMove(ticketId, status, newOrder);
    try {
      await moveTicket({ id: ticketId, status, order: newOrder });
    } catch (error) {
      setOptimisticMoves((prev) => {
        const next = new Map(prev);
        next.delete(ticketId);
        return next;
      });
      console.error(error);
    }
    setDragOverStatus(null);
    setDragOverTicketId(null);
    setDragOverPosition(null);
    setDraggingTicketId(null);
    dragPreviewRef.current = null;
    draggingRef.current = null;
  };

  const handleCardDrop = async (
    event: React.DragEvent,
    status: Status,
    targetId: Id<"tickets">
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const ticketId = (draggingTicketId ||
      event.dataTransfer.getData("text/plain")) as Id<"tickets">;
    if (!ticketId || ticketId === targetId) return;

    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const isAbove = event.clientY < rect.top + rect.height / 2;
    const newOrder = calculateDropOrder(
      status,
      targetId,
      isAbove ? "above" : "below",
      ticketId
    );
    if (newOrder === null) return;

    applyOptimisticMove(ticketId, status, newOrder);
    try {
      await moveTicket({ id: ticketId, status, order: newOrder });
    } catch (error) {
      setOptimisticMoves((prev) => {
        const next = new Map(prev);
        next.delete(ticketId);
        return next;
      });
      console.error(error);
    }

    setDragOverStatus(null);
    setDragOverTicketId(null);
    setDragOverPosition(null);
    setDraggingTicketId(null);
    dragPreviewRef.current = null;
    draggingRef.current = null;
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Kanban Board</h2>
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((prev) => !prev)}
          >
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Ticket
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map((status) => {
          const config = STATUS_CONFIG[status];
          const columnTickets = ticketsByStatus[status];

          return (
            <div key={status} className="flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <div className={`p-1.5 rounded ${config.colorClass}`}>
                  {config.icon}
                </div>
                <h3 className="font-medium">{config.label}</h3>
                <Badge variant="secondary" className="ml-auto">
                  {columnTickets.length}
                </Badge>
              </div>

              <ScrollArea
                className={`flex-1 rounded-lg border border-dashed transition-colors ${
                  dragOverStatus === status ? "border-primary/60 bg-primary/5" : "border-transparent"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverStatus(status);
                }}
                onDragLeave={() => setDragOverStatus(null)}
                onDrop={(event) => handleDrop(event, status)}
              >
                <div className="space-y-3 pr-2 min-h-[200px] p-2">
                  {buildTicketList(columnTickets).map(({ ticket, depth }) => {
                    const archived = isArchived(ticket);
                    return (
                      <Card
                        key={ticket._id}
                        className={`hover:border-primary/50 transition-colors group ${
                          dragOverTicketId === ticket._id
                            ? dragOverPosition === "above"
                              ? "ring-2 ring-primary/60"
                              : "ring-2 ring-primary/30"
                            : ""
                        } ${archived ? "opacity-60" : ""}`}
                        style={{ marginLeft: depth * 16 }}
                        onClick={() => {
                          if (draggingRef.current) return;
                          setEditingTicket(ticket);
                        }}
                        onDragOver={(event) => {
                          if (archived) return;
                          event.preventDefault();
                          setDragOverTicketId(ticket._id);
                          const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                          const isAbove = event.clientY < rect.top + rect.height / 2;
                          setDragOverPosition(isAbove ? "above" : "below");
                          const draggingId =
                            draggingTicketId ||
                            (event.dataTransfer.getData("text/plain") as Id<"tickets">);
                          if (!draggingId || draggingId === ticket._id) return;
                          const previewOrder = calculateDropOrder(
                            status,
                            ticket._id,
                            isAbove ? "above" : "below",
                            draggingId
                          );
                          if (previewOrder === null) return;
                          const nextKey = `${draggingId}:${status}:${previewOrder}`;
                          if (dragPreviewRef.current === nextKey) return;
                          dragPreviewRef.current = nextKey;
                          applyOptimisticMove(draggingId, status, previewOrder);
                        }}
                        onDrop={(event) => {
                          if (archived) return;
                          handleCardDrop(event, status, ticket._id);
                        }}
                      >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2 flex-1">
                            <button
                              type="button"
                              draggable={!archived}
                              className="mt-0.5 text-muted-foreground hover:text-primary"
                              onClick={(event) => event.stopPropagation()}
                              onDragStart={(event) => {
                                if (archived) return;
                                event.stopPropagation();
                                event.dataTransfer.setData("text/plain", ticket._id);
                                event.dataTransfer.effectAllowed = "move";
                                dragPreviewRef.current = null;
                                draggingRef.current = ticket._id;
                                setDraggingTicketId(ticket._id);
                              }}
                              onDragEnd={() => {
                                setDragOverStatus(null);
                                setDragOverTicketId(null);
                                setDragOverPosition(null);
                                setDraggingTicketId(null);
                                dragPreviewRef.current = null;
                                draggingRef.current = null;
                              }}
                              title="Drag to reorder"
                            >
                              <GripVertical className="w-4 h-4" />
                            </button>
                            <CardTitle className="text-sm font-medium leading-tight">
                            {ticket.number && (
                              <span className="text-xs text-muted-foreground mr-2">
                                {formatTicketNumber(workspacePrefix, ticket.number)}
                              </span>
                            )}
                            {ticket.title}
                            </CardTitle>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {status !== "unclaimed" && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(ticket._id, "unclaimed");
                                  }}
                                >
                                  <ArrowLeft className="w-4 h-4 mr-2" />
                                  Move to Unclaimed
                                </DropdownMenuItem>
                              )}
                              {status !== "in_progress" && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(ticket._id, "in_progress");
                                  }}
                                >
                                  <Clock className="w-4 h-4 mr-2" />
                                  Move to In Progress
                                </DropdownMenuItem>
                              )}
                              {status !== "done" && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(ticket._id, "done");
                                  }}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  Move to Done
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>Move to Feature Doc</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateTicket({ id: ticket._id, docId: null });
                                    }}
                                  >
                                    Ungrouped
                                  </DropdownMenuItem>
                                  {featureDocs.map((doc) => (
                                    <DropdownMenuItem
                                      key={doc._id}
                                      disabled={doc.archived && doc._id !== ticket.docId}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateTicket({ id: ticket._id, docId: doc._id });
                                      }}
                                    >
                                      {formatDocNumber(workspacePrefix, doc.number) ?? "DOC"} ·{" "}
                                      {doc.title}
                                      {doc.archived ? " (archived)" : ""}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTicket({ id: ticket._id, archived: !archived });
                                }}
                              >
                                {archived ? (
                                  <ArchiveRestore className="w-4 h-4 mr-2" />
                                ) : (
                                  <Archive className="w-4 h-4 mr-2" />
                                )}
                                {archived ? "Unarchive" : "Archive"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(ticket._id);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {ticket.description}
                        </p>
                        {ticket.docId && docsById.get(ticket.docId) && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`${pathname}?tab=feature-docs&doc=${ticket.docId}`);
                            }}
                          >
                            <Badge variant="secondary" className="mt-1 text-xs max-w-[200px] truncate">
                              Doc:{" "}
                              {formatDocNumber(
                                workspacePrefix,
                                docsById.get(ticket.docId)!.number
                              )
                                ? `${formatDocNumber(
                                    workspacePrefix,
                                    docsById.get(ticket.docId)!.number
                                  )} · ${docsById.get(ticket.docId)!.title}`
                                : docsById.get(ticket.docId)!.title}
                            </Badge>
                          </button>
                        )}
                        {archived && (
                          <Badge variant="outline" className="mt-2 text-xs">
                            Archived
                          </Badge>
                        )}
                        {ticket.ownerId && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {ticket.ownerType === "agent" ? (
                              <Bot className="w-3 h-3" />
                            ) : (
                              <User className="w-3 h-3" />
                            )}
                            <span>{ticket.ownerId}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      <TicketModal
        workspaceId={workspaceId}
        featureDocs={featureDocs}
        tickets={tickets}
        workspacePrefix={workspacePrefix}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {editingTicket && (
        <TicketModal
          workspaceId={workspaceId}
          featureDocs={featureDocs}
          tickets={tickets}
          workspacePrefix={workspacePrefix}
          ticket={editingTicket}
          open={true}
          onOpenChange={(open) => !open && setEditingTicket(null)}
        />
      )}
    </>
  );
}
