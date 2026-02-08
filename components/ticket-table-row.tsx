"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Bot, ChevronDown, ChevronRight, GripVertical, Plus, User } from "lucide-react";
import { formatTicketNumber } from "@/lib/utils";
import { IssueStatus } from "@/components/issue-status";
import { TicketActionsMenu } from "@/components/ticket-actions-menu";

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
  const statusAccent =
    ticket.status === "done" ? "#00FF94" : ticket.status === "in_progress" ? "#FFB800" : "#FF3B00";
  const statusLabel =
    ticket.status === "done" ? "DONE" : ticket.status === "in_progress" ? "IN PROGRESS" : "UNCLAIMED";
  const ownerLabel = ticket.ownerDisplayName || ticket.ownerId || "\u2014";

  return (
    <div
      className={`cursor-pointer px-4 py-3 transition-colors md:grid md:grid-cols-[90px_minmax(0,1fr)_170px_120px_110px] md:items-center md:px-7 ${
        isArchived
          ? "opacity-65 grayscale-[35%] hover:bg-[#141414] hover:opacity-95 hover:grayscale-0"
          : "hover:bg-[#141414]"
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
          className="hidden border border-[#2f2f2f] bg-[#0f0f0f] p-1 text-[#666] hover:text-[#bdbdbd] md:inline-flex"
          draggable
          onDragStart={onDragStart}
        >
          <GripVertical className="h-3 w-3" />
        </button>

        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden border border-[#2f2f2f] bg-[#0f0f0f] p-1 text-[#666] hover:text-[#bdbdbd] md:inline-flex"
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
          className="line-clamp-1 break-all text-sm font-semibold text-[#d7d7d7] hover:text-white"
        >
          {ticket.title}
        </Link>
        {(parentTicket || progressTotal > 0 || isArchived) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666]">
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

      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#777]">
        {ticket.ownerId ? (
          <>
            {ticket.ownerType === "agent" ? <Bot className="h-3 w-3 text-[#FF3B00]" /> : <User className="h-3 w-3" />}
            <span className="truncate" style={{ color: ticket.ownerType === "agent" ? "#FF3B00" : "#888" }}>
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
          className="hidden border border-[#2f2f2f] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666] transition hover:border-[#555] hover:text-[#bbb] md:inline-flex"
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
}
