"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, GripVertical, Plus, User } from "lucide-react";
import { formatTicketNumber } from "@/lib/utils";
import { IssueStatus } from "@/components/issue-status";
import { TicketActionsMenu } from "@/components/ticket-actions-menu";
import { ArchivedBadge } from "@/components/archived-badge";

type Ticket = Doc<"tickets">;

interface TicketCardProps {
  ticket: Ticket;
  workspaceId: Id<"workspaces">;
  workspacePrefix: string;
  parentTicket?: Ticket | null;
  isDragOver: boolean;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragHandleEnd: () => void;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onStatusChange: (status: IssueStatus) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function TicketCard({
  ticket,
  workspaceId,
  workspacePrefix,
  parentTicket,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragHandleEnd,
  onClick,
  onKeyDown,
  onStatusChange,
  onArchiveToggle,
  onDelete,
}: TicketCardProps) {
  const ticketNumber = formatTicketNumber(workspacePrefix, ticket.number);
  const progressTotal = ticket.childCount ?? 0;
  const progressDone = ticket.childDoneCount ?? 0;
  const isArchived = ticket.archived ?? false;

  return (
    <Card
      className={`group relative gap-4 p-3 transition ${
        isArchived
          ? "border-border/40 bg-muted/25 opacity-60 grayscale-[35%] hover:opacity-90 hover:grayscale-0"
          : "border-border/80 bg-card/70 hover:border-primary/60 hover:bg-accent/35"
      } ${isDragOver ? "border-primary/70 ring-1 ring-primary/45" : ""}`}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            className="mt-0.5 border border-border/70 bg-background/60 p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragHandleEnd}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                {ticketNumber ?? "--"}
              </span>
              {progressTotal > 0 && (
                <Badge variant="outline" className="font-mono text-[10px] tracking-[0.08em]">
                  {progressDone}/{progressTotal}
                </Badge>
              )}
              {isArchived && <ArchivedBadge />}
            </div>

            <Link
              href={`/workspace/${workspaceId}/tickets/${ticket._id}`}
              className="line-clamp-2 text-sm font-semibold leading-snug hover:text-primary"
            >
              {ticket.title}
            </Link>

            {parentTicket && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Sub-issue of{" "}
                <span className="font-mono">
                  {formatTicketNumber(workspacePrefix, parentTicket.number) ?? "--"}
                </span>{" "}
                · {parentTicket.title}
              </div>
            )}

            {ticket.description && (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{ticket.description}</p>
            )}
          </div>
        </div>

        <TicketActionsMenu
          isArchived={isArchived}
          onStatusChange={onStatusChange}
          onArchiveToggle={onArchiveToggle}
          onDelete={onDelete}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/workspace/${workspaceId}/tickets/${ticket._id}`}>Open</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/workspace/${workspaceId}/tickets/new?parentId=${ticket._id}`}>
            <Plus className="mr-1 h-3 w-3" />
            Sub-issue
          </Link>
        </Button>
        {ticket.ownerId ? (
          <Badge variant="outline" className="ml-auto gap-1 font-mono text-[10px] tracking-[0.08em]">
            {ticket.ownerType === "agent" ? (
              <Bot className="h-3 w-3 text-primary" />
            ) : (
              <User className="h-3 w-3" />
            )}
            {ticket.ownerDisplayName || ticket.ownerId}
          </Badge>
        ) : (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Unassigned
          </span>
        )}
      </div>
    </Card>
  );
}
