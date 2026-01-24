"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IssueStatusBadge, IssueStatus, STATUS_META } from "@/components/issue-status";
import { Bot, User } from "lucide-react";

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
      <Card className="p-4 space-y-3 bg-card/40">
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <IssueStatusBadge status={ticket.status} className="mt-1" />
          <select
            className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
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
          <div className="text-xs text-muted-foreground">Owner</div>
          {ticket.ownerId ? (
            <div className="mt-1 inline-flex items-center gap-1 text-sm">
              {ticket.ownerType === "agent" ? (
                <Bot className="w-3 h-3 text-muted-foreground" />
              ) : (
                <User className="w-3 h-3 text-muted-foreground" />
              )}
              {ticket.ownerId}
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">Unassigned</div>
          )}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Created</div>
          <div className="text-sm">{new Date(ticket.createdAt).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Updated</div>
          <div className="text-sm">{new Date(ticket.updatedAt).toLocaleString()}</div>
        </div>
      </Card>

      <Card className="p-4 space-y-2 bg-card/40">
        <div className="text-xs text-muted-foreground">Project Docs</div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/workspace/${workspaceId}/settings`}>Open project docs</Link>
        </Button>
      </Card>

      <Card className="p-4 bg-card/40">
        <div className="text-xs text-muted-foreground">Sub-issue progress</div>
        {progressTotal > 0 ? (
          <>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span>
                {progressDone}/{progressTotal} done
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
          </>
        ) : (
          <div className="mt-2 text-sm text-muted-foreground">No sub-issues yet.</div>
        )}
      </Card>
    </aside>
  );
}
