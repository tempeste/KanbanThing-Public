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
      className={`flex flex-col gap-3 px-4 py-3 transition-colors md:grid md:grid-cols-[minmax(0,1fr)_150px_180px_140px] md:items-center ${
        isArchived
          ? "bg-muted/25 opacity-65 grayscale-[35%] hover:opacity-95 hover:grayscale-0"
          : "hover:bg-accent/30"
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
              className="absolute bottom-2 top-2 w-px bg-border/60"
              style={{ left: `${Math.max(depth * 16 - 8, 0)}px` }}
            />
            <span
              className="absolute top-1/2 h-px w-3 bg-border/60"
              style={{ left: `${Math.max(depth * 16 - 8, 0)}px` }}
            />
          </>
        )}

        <button
          type="button"
          className="mt-0.5 border border-border/70 bg-background/70 p-1 text-muted-foreground hover:text-foreground"
          draggable
          onDragStart={onDragStart}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="mt-0.5 border border-border/70 bg-background/70 p-1 text-muted-foreground hover:text-foreground"
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="mt-0.5 h-6 w-6 border border-transparent" />
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              {ticketNumber ?? "--"}
            </span>
            <Link
              href={`/workspace/${workspaceId}/tickets/${ticket._id}?tab=list`}
              className="line-clamp-1 font-semibold hover:text-primary"
            >
              {ticket.title}
            </Link>
          </div>

          {parentTicket && (
            <div className="mt-1 text-xs text-muted-foreground">
              Sub-issue of{" "}
              <span className="font-mono">
                {formatTicketNumber(workspacePrefix, parentTicket.number) ?? "--"}
              </span>{" "}
              · {parentTicket.title}
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            {progressTotal > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] tracking-[0.08em]">
                {progressDone}/{progressTotal}
              </Badge>
            )}
            {isArchived && <ArchivedBadge />}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="kb-label md:hidden">Status</span>
        <IssueStatusBadge status={ticket.status} />
      </div>

      <div className="flex items-center gap-2">
        <span className="kb-label md:hidden">Assignee</span>
        {ticket.ownerId ? (
          <span className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.08em]">
            {ticket.ownerType === "agent" ? (
              <Bot className="h-3 w-3 text-primary" />
            ) : (
              <User className="h-3 w-3 text-muted-foreground" />
            )}
            {ticket.ownerDisplayName || ticket.ownerId}
          </span>
        ) : (
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">--</span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 md:justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/workspace/${workspaceId}/tickets/new?parentId=${ticket._id}`}>
            <Plus className="mr-1 h-3 w-3" />
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
