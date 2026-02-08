"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { IssueStatusBadge } from "@/components/issue-status";
import { formatTicketNumber } from "@/lib/utils";

type Ticket = Doc<"tickets">;

interface SubIssuesCardProps {
  workspaceId: Id<"workspaces">;
  workspacePrefix: string;
  ticketId: Id<"tickets">;
  progressDone: number;
  progressTotal: number;
  subIssues: Ticket[];
  availableChildCandidates: Ticket[];
  existingChildId: Id<"tickets"> | "";
  onExistingChildChange: (value: Id<"tickets"> | "") => void;
  onAddExisting: () => void;
  isAddingExisting: boolean;
}

export function SubIssuesCard({
  workspaceId,
  workspacePrefix,
  ticketId,
  progressDone,
  progressTotal,
  subIssues,
  availableChildCandidates,
  existingChildId,
  onExistingChildChange,
  onAddExisting,
  isAddingExisting,
}: SubIssuesCardProps) {
  const hasCandidates = availableChildCandidates.length > 0;
  const selectOptions = useMemo(
    () =>
      availableChildCandidates.map((candidate) => (
        <option key={candidate._id} value={candidate._id}>
          {formatTicketNumber(workspacePrefix, candidate.number) ?? "--"} · {candidate.title}
        </option>
      )),
    [availableChildCandidates, workspacePrefix]
  );

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-lg font-semibold tracking-[0.03em]">Sub-issues</h3>
            {progressTotal > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] tracking-[0.1em]">
                {progressDone}/{progressTotal}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Break the issue into small, executable slices.</p>
        </div>
        <Button asChild>
          <Link href={`/workspace/${workspaceId}/tickets/new?parentId=${ticketId}`}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Sub-issue
          </Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full">
          <Label htmlFor="existing-sub-issue" className="kb-label">
            Add Existing Issue
          </Label>
          <select
            id="existing-sub-issue"
            value={existingChildId}
            onChange={(event) =>
              onExistingChildChange(event.target.value ? (event.target.value as Id<"tickets">) : "")
            }
            className="mt-2 flex h-10 w-full border border-input bg-background/70 px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">Select an issue</option>
            {selectOptions}
          </select>
          {!hasCandidates && <p className="mt-2 text-xs text-muted-foreground">No available issues to add.</p>}
        </div>
        <Button variant="outline" onClick={onAddExisting} disabled={!existingChildId || isAddingExisting}>
          {isAddingExisting ? "Adding..." : "Attach"}
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {subIssues.length === 0 && <p className="text-sm text-muted-foreground">No sub-issues yet.</p>}
        {subIssues.map((child) => (
          <div
            key={child._id}
            className="flex items-center justify-between border border-border/70 bg-card/55 px-3 py-2"
          >
            <div className="min-w-0">
              <Link
                href={`/workspace/${workspaceId}/tickets/${child._id}`}
                className="line-clamp-1 font-semibold hover:text-primary"
              >
                {child.title}
              </Link>
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                {formatTicketNumber(workspacePrefix, child.number) ?? "--"}
              </div>
            </div>
            <IssueStatusBadge status={child.status} />
          </div>
        ))}
      </div>
    </Card>
  );
}
