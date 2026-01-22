"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Clock, CheckCircle2, Circle, User, Bot, MoreVertical, Trash2, ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TicketModal } from "@/components/ticket-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}

export function KanbanBoard({ workspaceId, tickets, featureDocs }: KanbanBoardProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const updateStatus = useMutation(api.tickets.updateStatus);
  const deleteTicket = useMutation(api.tickets.remove);

  const columns: Status[] = ["unclaimed", "in_progress", "done"];
  const ticketsByStatus = columns.reduce(
    (acc, status) => {
      acc[status] = tickets.filter((t) => t.status === status);
      return acc;
    },
    {} as Record<Status, Ticket[]>
  );
  const docsById = useMemo(
    () => new Map(featureDocs.map((doc) => [doc._id, doc])),
    [featureDocs]
  );

  const handleStatusChange = async (ticketId: Id<"tickets">, newStatus: Status) => {
    await updateStatus({ id: ticketId, status: newStatus });
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this ticket?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const handleDrop = async (event: React.DragEvent, status: Status) => {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData("text/plain") as Id<"tickets">;
    if (!ticketId) return;
    await updateStatus({ id: ticketId, status });
    setDragOverStatus(null);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Kanban Board</h2>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
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
                  {columnTickets.map((ticket) => (
                    <Card
                      key={ticket._id}
                      draggable
                      className="cursor-pointer hover:border-primary/50 transition-colors group"
                      onClick={() => setEditingTicket(ticket)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", ticket._id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm font-medium leading-tight">
                            {ticket.title}
                          </CardTitle>
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
                              router.push(`${pathname}?tab=docs&doc=${ticket.docId}`);
                            }}
                          >
                            <Badge variant="secondary" className="mt-1 text-xs max-w-[200px] truncate">
                              Doc: {docsById.get(ticket.docId)!.title}
                            </Badge>
                          </button>
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
                        {ticket.docs && (
                          <Badge variant="outline" className="mt-2 text-xs">
                            Ticket notes
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      <TicketModal
        workspaceId={workspaceId}
        featureDocs={featureDocs}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {editingTicket && (
        <TicketModal
          workspaceId={workspaceId}
          featureDocs={featureDocs}
          ticket={editingTicket}
          open={true}
          onOpenChange={(open) => !open && setEditingTicket(null)}
        />
      )}
    </>
  );
}
