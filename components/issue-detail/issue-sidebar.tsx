"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { IssueStatus, STATUS_META } from "@/components/issue-status";
import { AssigneePicker } from "@/components/assignee-picker";
import { ExternalLink } from "lucide-react";

type Ticket = Doc<"tickets">;

interface IssueSidebarProps {
  ticket: Ticket;
  workspaceId: Id<"workspaces">;
  progressDone: number;
  progressTotal: number;
  progressPct: number;
  onStatusChange: (status: IssueStatus) => void;
}

export function IssueSidebar({
  ticket,
  workspaceId,
  progressDone,
  progressTotal,
  progressPct,
  onStatusChange,
}: IssueSidebarProps) {
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
            {Object.entries(STATUS_META).map(([status, config]) => (
              <option key={status} value={status}>
                {config.label}
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
