"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { IssueStatus, STATUS_META } from "@/components/issue-status";
import { AssigneePicker } from "@/components/assignee-picker";
import { TagPicker } from "@/components/tag-picker";
import { DispatchTicketsButton } from "@/components/dispatch-tickets-button";
import { CancelDispatchButton } from "@/components/cancel-dispatch-button";
import { ForceReturnToUnclaimedButton } from "@/components/force-return-to-unclaimed-button";
import { PRIORITY_META, PRIORITY_ORDER, type TicketPriority } from "@/lib/priority";
import { ExternalLink } from "lucide-react";

type Ticket = Doc<"tickets">;

interface IssueSidebarProps {
  ticket: Ticket;
  workspaceId: Id<"workspaces">;
  workspacePrefix: string;
  progressDone: number;
  progressTotal: number;
  progressPct: number;
  dispatchExecutionDispatchId?: string | null;
  dispatchExecutionBadgeLabel?: string | null;
  onStatusChange: (status: IssueStatus) => void;
  onForceReturnToUnclaimed?: () => Promise<void> | void;
  onPriorityChange: (priority: TicketPriority) => void;
}

export function IssueSidebar({
  ticket,
  workspaceId,
  workspacePrefix,
  progressDone,
  progressTotal,
  progressPct,
  dispatchExecutionDispatchId,
  dispatchExecutionBadgeLabel,
  onStatusChange,
  onForceReturnToUnclaimed,
  onPriorityChange,
}: IssueSidebarProps) {
  const statusOptions = Object.entries(STATUS_META).filter(([status]) => {
    if (status !== "dispatched") return true;
    return ticket.status === "dispatched";
  });

  return (
    <aside className="space-y-0 lg:sticky lg:top-6 lg:self-start">
      <div className="border border-border/60 bg-card/40 divide-y divide-border/40">
        {/* Status */}
        <div className="px-4 py-3">
          <div className="kb-label mb-2">Status</div>
          <select
            className="flex h-8 w-full border border-input bg-background/70 px-2.5 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
            value={ticket.status}
            onChange={(event) => onStatusChange(event.target.value as IssueStatus)}
          >
            {statusOptions.map(([status, config]) => (
              <option key={status} value={status}>
                {config.label}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div className="px-4 py-3">
          <div className="kb-label mb-2">Priority</div>
          <select
            className="flex h-8 w-full border border-input bg-background/70 px-2.5 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
            value={ticket.priority ?? "none"}
            onChange={(event) => onPriorityChange(event.target.value as TicketPriority)}
          >
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].shortLabel !== "—"
                  ? `${PRIORITY_META[p].shortLabel} — ${PRIORITY_META[p].label}`
                  : PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </div>

        {/* Assignee */}
        <div className="px-4 py-3">
          <div className="kb-label mb-2">Assignee</div>
          <AssigneePicker
            workspaceId={workspaceId}
            ticketId={ticket._id}
            currentOwnerId={ticket.ownerId}
            currentOwnerType={ticket.ownerType}
            currentOwnerDisplayName={ticket.ownerDisplayName}
          />
        </div>

        {/* Tags */}
        <div className="px-4 py-3">
          <div className="kb-label mb-2">Tags</div>
          <TagPicker
            workspaceId={workspaceId}
            ticketId={ticket._id}
            currentTags={ticket.tags ?? []}
          />
        </div>

        {ticket.status !== "done" && (
          <div className="px-4 py-3">
            <div className="kb-label mb-2">Dispatch</div>
            <div className="space-y-2">
              {ticket.status === "dispatched" && dispatchExecutionBadgeLabel && (
                <div>
                  <span className="inline-flex border border-dispatched/45 bg-dispatched/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-dispatched">
                    {dispatchExecutionBadgeLabel}
                  </span>
                </div>
              )}

              <DispatchTicketsButton
                workspaceId={workspaceId}
                workspacePrefix={workspacePrefix}
                tickets={[
                  {
                    _id: ticket._id,
                    number: ticket.number ?? undefined,
                    title: ticket.title,
                  },
                ]}
                triggerLabel="Dispatch This Ticket"
                triggerClassName="w-full"
              />

              {ticket.status === "dispatched" && ticket.lastDispatchInstanceId && (
                <CancelDispatchButton
                  workspaceId={workspaceId}
                  instanceId={ticket.lastDispatchInstanceId}
                  ticketId={ticket._id}
                  dispatchId={dispatchExecutionDispatchId}
                  runId={ticket.lastDispatchRunId ?? null}
                  disabled={!ticket.lastDispatchInstanceId}
                />
              )}

              {ticket.status === "dispatched" && onForceReturnToUnclaimed && (
                <ForceReturnToUnclaimedButton onConfirm={onForceReturnToUnclaimed} />
              )}
            </div>
          </div>
        )}

        {/* Progress */}
        {progressTotal > 0 && (
          <div className="px-4 py-3">
            <div className="kb-label mb-2">Progress</div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">
                {progressDone}/{progressTotal} done
              </span>
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
                {progressPct}%
              </span>
            </div>
            <div className="h-1 bg-border/40 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Dates */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="kb-label mb-1">Created</div>
              <div className="text-muted-foreground">
                {new Date(ticket.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="kb-label mb-1">Updated</div>
              <div className="text-muted-foreground">
                {new Date(ticket.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Workspace link */}
        <div className="px-4 py-3">
          <Link
            href={`/workspace/${workspaceId}/settings`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Workspace Settings
          </Link>
        </div>
      </div>
    </aside>
  );
}
