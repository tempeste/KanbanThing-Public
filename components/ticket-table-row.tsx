"use client";

import Link from "next/link";
import { memo } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Bot, ChevronDown, ChevronRight, GripVertical, Plus, User } from "lucide-react";
import { formatTicketNumber } from "@/lib/utils";
import { IssueStatus } from "@/components/issue-status";
import { TicketActionsMenu } from "@/components/ticket-actions-menu";
import { TicketSummary } from "@/lib/ticket-summary";

interface TicketTableRowProps {
  ticket: TicketSummary;
  workspaceId: Id<"workspaces">;
  workspacePrefix: string;
  parentTicket?: TicketSummary | null;
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

export const TicketTableRow = memo(function TicketTableRow({
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
  const statusAccent =
    ticket.status === "done" ? "var(--done)" : ticket.status === "in_progress" ? "var(--in-progress)" : "var(--unclaimed)";
  const statusLabel =
    ticket.status === "done" ? "DONE" : ticket.status === "in_progress" ? "IN PROGRESS" : "UNCLAIMED";
  const ownerLabel = ticket.ownerDisplayName || ticket.ownerId || "\u2014";

  return (
    <div
      className={`cursor-pointer px-4 py-2 transition-colors md:grid md:grid-cols-[90px_minmax(0,1fr)_170px_120px_110px] md:items-center md:px-7 ${
        isArchived
          ? "opacity-65 grayscale-[35%] hover:bg-accent hover:opacity-95 hover:grayscale-0"
          : "hover:bg-accent"
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
      <div
        className="relative flex min-w-0 items-center gap-2"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        <button
          type="button"
          className="hidden border border-border bg-card p-1 text-muted-foreground hover:text-foreground/80 md:inline-flex"
          draggable
          onDragStart={onDragStart}
        >
          <GripVertical className="h-3 w-3" />
        </button>

        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden border border-border bg-card p-1 text-muted-foreground hover:text-foreground/80 md:inline-flex"
          >
            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        ) : null}

        <span className="font-mono text-[12px] font-bold tracking-[0.05em]" style={{ color: statusAccent }}>
          {ticketNumber ?? "--"}
        </span>
      </div>

      <div className="min-w-0">
        <Link
          href={`/workspace/${workspaceId}/tickets/${ticket._id}?tab=list`}
          className="line-clamp-1 break-all text-sm font-semibold text-foreground/90 hover:text-foreground"
        >
          {ticket.title}
        </Link>
        {(parentTicket || progressTotal > 0 || isArchived) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {parentTicket && (
              <span className="truncate">
                Parent {formatTicketNumber(workspacePrefix, parentTicket.number) ?? "--"}
              </span>
            )}
            {progressTotal > 0 && (
              <span>
                {progressDone}/{progressTotal}
              </span>
            )}
            {isArchived && <span>Archived</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {ticket.ownerId ? (
          <>
            {ticket.ownerType === "agent" ? <Bot className="h-3 w-3 text-primary" /> : <User className="h-3 w-3" />}
            <span className="truncate" style={{ color: ticket.ownerType === "agent" ? "var(--unclaimed)" : "var(--muted-foreground)" }}>
              {ownerLabel}
            </span>
          </>
        ) : (
          <span>{ownerLabel}</span>
        )}
      </div>

      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: statusAccent }}>
        {statusLabel}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <Link
          href={`/workspace/${workspaceId}/tickets/new?parentId=${ticket._id}`}
          className="hidden border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground/80 md:inline-flex"
        >
          <Plus className="h-3 w-3" />
        </Link>
        <TicketActionsMenu
          isArchived={isArchived}
          onStatusChange={onStatusChange}
          onArchiveToggle={onArchiveToggle}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
});

TicketTableRow.displayName = "TicketTableRow";
