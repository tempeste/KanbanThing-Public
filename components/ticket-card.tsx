"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Bot, GripVertical, User } from "lucide-react";
import { formatTicketNumber } from "@/lib/utils";
import { IssueStatus } from "@/components/issue-status";
import { TicketActionsMenu } from "@/components/ticket-actions-menu";

type Ticket = Doc<"tickets">;

interface TicketCardProps {
  ticket: Ticket;
  workspaceId: Id<"workspaces">;
  workspacePrefix: string;
  parentTicket?: Ticket | null;
  accent: string;
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
  accent,
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
  const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;
  const priorityLabel = ticket.status === "done" ? "P0" : ticket.status === "in_progress" ? "P1" : "P2";
  const priorityColor = ticket.status === "done" ? "#FF3B00" : ticket.status === "in_progress" ? "#FFB800" : "#737373";
  const ownerLabel = ticket.ownerDisplayName || ticket.ownerId || "";
  const ownerIsAgent = ticket.ownerType === "agent";

  return (
    <article
      className={`group relative border-2 p-4 transition-[border-color,background-color,transform] duration-150 ${
        isArchived
          ? "border-[#2b2b2b] bg-[#0f0f0f]/80 opacity-60 grayscale-[30%] hover:opacity-85 hover:grayscale-0"
          : "border-[#333] bg-[#111] hover:-translate-y-px hover:border-white/35 hover:bg-[#171717]"
      } ${isDragOver ? "border-[#666]" : ""}`}
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
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <button
            type="button"
            className="mt-0.5 border border-[#2d2d2d] bg-[#0d0d0d] p-1 text-[#666] opacity-0 transition hover:text-[#bdbdbd] group-hover:opacity-100"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragHandleEnd}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: accent }}>
                {ticketNumber ?? "--"}
              </span>
            </div>

            <Link
              href={`/workspace/${workspaceId}/tickets/${ticket._id}`}
              className="line-clamp-2 break-words text-[14px] font-semibold leading-[1.35] text-[#e6e6e6] hover:text-white"
            >
              {ticket.title}
            </Link>

            {parentTicket && (
              <div className="mt-2 line-clamp-1 font-mono text-[10px] uppercase tracking-[0.09em] text-[#5a5a5a]">
                Sub-issue of{" "}
                <span className="text-[#7a7a7a]">
                  {formatTicketNumber(workspacePrefix, parentTicket.number) ?? "--"}
                </span>{" "}
                {parentTicket.title}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span
            className="inline-flex border px-2 py-1 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-black"
            style={{ backgroundColor: priorityColor, borderColor: priorityColor }}
          >
            {priorityLabel}
          </span>
          <div className="opacity-0 transition-opacity group-hover:opacity-100">
            <TicketActionsMenu
              isArchived={isArchived}
              onStatusChange={onStatusChange}
              onArchiveToggle={onArchiveToggle}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {isArchived && (
            <span className="border border-[#3a3a3a] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#8a8a8a]">
              Archived
            </span>
          )}
          {ticket.description && (
            <span className="border border-[#2f2f2f] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#777]">
              Detail
            </span>
          )}
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {progressTotal > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="h-[3px] w-10 overflow-hidden bg-[#303030]">
                <div className="h-full" style={{ width: `${progressPct}%`, background: accent }} />
              </div>
              <span className="font-mono text-[10px] text-[#666]">
                {progressDone}/{progressTotal}
              </span>
            </div>
          )}

          {ownerLabel ? (
            <span
              className="inline-flex max-w-[150px] items-center gap-1 truncate font-mono text-[10px] font-bold uppercase tracking-[0.06em]"
              style={{ color: ownerIsAgent ? "#FF3B00" : "#8a8a8a" }}
              title={ownerLabel}
            >
              {ownerIsAgent ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
              <span className="truncate">{ownerLabel}</span>
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#555]">
              Unassigned
            </span>
          )}
        </div>
      </div>

      {ticket.description && (
        <p className="mt-2 line-clamp-1 text-[12px] text-[#6d6d6d]">
          {ticket.description}
        </p>
      )}
    </article>
  );
}
