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
      className={`group relative rounded-lg border p-3 shadow-sm transition ${
        isArchived
          ? "opacity-60 bg-muted/30 border-border/40 grayscale-[30%] hover:opacity-80 hover:grayscale-0"
          : "border-border/60 bg-background/40 hover:border-primary/40 hover:bg-accent/30"
      } ${isDragOver ? "border-primary/40 shadow-md" : ""}`}
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
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragHandleEnd}
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
              {isArchived && <ArchivedBadge />}
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
        <TicketActionsMenu
          isArchived={isArchived}
          onStatusChange={onStatusChange}
          onArchiveToggle={onArchiveToggle}
          onDelete={onDelete}
        />
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
          <Link href={`/workspace/${workspaceId}/tickets/new?parentId=${ticket._id}`}>
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
            {ticket.ownerDisplayName || ticket.ownerId}
          </Badge>
        )}
      </div>
    </Card>
  );
}
