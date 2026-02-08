"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IssueStatusBadge, IssueStatus, STATUS_META } from "@/components/issue-status";
import { AssigneePicker } from "@/components/assignee-picker";

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
    <aside className="space-y-4">
      <Card className="space-y-4 p-4">
        <div>
          <div className="kb-label mb-2">Status</div>
          <IssueStatusBadge status={ticket.status} className="mb-2" />
          <select
            className="mt-1 flex h-10 w-full border border-input bg-background/70 px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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

        <div>
          <div className="kb-label mb-2">Assignee</div>
          <AssigneePicker
            workspaceId={workspaceId}
            ticketId={ticket._id}
            currentOwnerId={ticket.ownerId}
            currentOwnerType={ticket.ownerType}
            currentOwnerDisplayName={ticket.ownerDisplayName}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="kb-label mb-1">Created</div>
            <div>{new Date(ticket.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="kb-label mb-1">Updated</div>
            <div>{new Date(ticket.updatedAt).toLocaleString()}</div>
          </div>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <div className="kb-label">Project Docs</div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/workspace/${workspaceId}/settings`}>Open Workspace Settings</Link>
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="kb-label">Sub-issue Progress</div>
        {progressTotal > 0 ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span>
                {progressDone}/{progressTotal} done
              </span>
              <span className="font-mono text-xs tracking-[0.12em]">{progressPct}%</span>
            </div>
            <div className="h-2 border border-border/70 bg-background/70">
              <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No sub-issues yet.</div>
        )}
      </Card>
    </aside>
  );
}
