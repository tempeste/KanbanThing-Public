"use client";

import Link from "next/link";
import { memo } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Bot, GripVertical, User } from "lucide-react";
import { formatTicketNumber } from "@/lib/utils";
import { IssueStatus } from "@/components/issue-status";
import { TicketActionsMenu } from "@/components/ticket-actions-menu";
import { TicketSummary } from "@/lib/ticket-summary";

interface TicketCardProps {
  ticket: TicketSummary;
  workspaceId: Id<"workspaces">;
  workspacePrefix: string;
  parentTicket?: TicketSummary | null;
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

export const TicketCard = memo(function TicketCard({
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
  const priorityColor = ticket.status === "done" ? "var(--unclaimed)" : ticket.status === "in_progress" ? "var(--in-progress)" : "var(--muted-foreground)";
  const ownerLabel = ticket.ownerDisplayName || ticket.ownerId || "";
  const ownerIsAgent = ticket.ownerType === "agent";

  return (
    <article
      className={`group relative border-2 px-3.5 py-3 transition-[border-color,background-color,transform] duration-150 ${
        isArchived
          ? "border-border/60 bg-card/80 opacity-60 grayscale-[30%] hover:opacity-85 hover:grayscale-0"
          : "border-border bg-card hover:-translate-y-px hover:border-foreground/35 hover:bg-accent"
      } ${isDragOver ? "border-muted-foreground" : ""}`}
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
            className="mt-0.5 border border-border bg-card p-1 text-muted-foreground opacity-0 transition hover:text-foreground/80 group-hover:opacity-100"
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
              className="line-clamp-2 break-words text-[14px] font-semibold leading-[1.35] text-foreground hover:text-foreground"
            >
              {ticket.title}
            </Link>

            {parentTicket && (
              <div className="mt-2 line-clamp-1 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground/70">
                Sub-issue of{" "}
                <span className="text-muted-foreground">
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
            <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              Archived
            </span>
          )}
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {progressTotal > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="h-[3px] w-10 overflow-hidden bg-muted">
                <div className="h-full" style={{ width: `${progressPct}%`, background: accent }} />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {progressDone}/{progressTotal}
              </span>
            </div>
          )}

          {ownerLabel ? (
            <span
              className="inline-flex max-w-[150px] items-center gap-1 truncate font-mono text-[10px] font-bold uppercase tracking-[0.06em]"
              style={{ color: ownerIsAgent ? "var(--unclaimed)" : "var(--muted-foreground)" }}
              title={ownerLabel}
            >
              {ownerIsAgent ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
              <span className="truncate">{ownerLabel}</span>
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
              Unassigned
            </span>
          )}
        </div>
      </div>

    </article>
  );
});

TicketCard.displayName = "TicketCard";
