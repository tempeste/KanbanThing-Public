"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, ChevronDown, ChevronRight, GripVertical, Plus, User } from "lucide-react";
import { formatTicketNumber } from "@/lib/utils";
import { IssueStatusBadge, IssueStatus } from "@/components/issue-status";
import { TicketActionsMenu } from "@/components/ticket-actions-menu";
import { ArchivedBadge } from "@/components/archived-badge";

type Ticket = Doc<"tickets">;

interface TicketTableRowProps {
  ticket: Ticket;
  workspaceId: Id<"workspaces">;
  workspacePrefix: string;
  parentTicket?: Ticket | null;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  dragClass: string;
  onToggleCollapse: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onStatusChange: (status: IssueStatus) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function TicketTableRow({
  ticket,
  workspaceId,
  workspacePrefix,
  parentTicket,
  depth,
  hasChildren,
  isCollapsed,
  dragClass,
  onToggleCollapse,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onKeyDown,
  onStatusChange,
  onArchiveToggle,
  onDelete,
}: TicketTableRowProps) {
  const ticketNumber = formatTicketNumber(workspacePrefix, ticket.number);
  const progressTotal = ticket.childCount ?? 0;
  const progressDone = ticket.childDoneCount ?? 0;
  const isArchived = ticket.archived ?? false;

  return (
    <div
      className={`flex flex-col gap-3 px-4 py-3 transition-colors md:grid md:grid-cols-[minmax(0,1fr)_140px_160px_120px] md:items-center ${
        isArchived
          ? "opacity-60 bg-muted/20 grayscale-[30%] hover:opacity-80 hover:grayscale-0 hover:bg-muted/30"
          : "hover:bg-accent/20"
      } ${dragClass}`}
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
          onDragStart={onDragStart}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleCollapse}
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
              href={`/workspace/${workspaceId}/tickets/${ticket._id}?tab=list`}
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
          {isArchived && (
            <div className="mt-1">
              <ArchivedBadge />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground md:hidden">Status</span>
        <IssueStatusBadge status={ticket.status} />
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
        <TicketActionsMenu
          isArchived={isArchived}
          onStatusChange={onStatusChange}
          onArchiveToggle={onArchiveToggle}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
