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
          {formatTicketNumber(workspacePrefix, candidate.number) ?? "—"} ·{" "}
          {candidate.title}
        </option>
      )),
    [availableChildCandidates, workspacePrefix]
  );

  return (
    <Card className="p-6 bg-card/40">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Sub-issues</h3>
            {progressTotal > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {progressDone}/{progressTotal}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Break down the work into ralph-sized steps.
          </p>
        </div>
        <Button asChild>
          <Link href={`/workspace/${workspaceId}/tickets/new?parentId=${ticketId}`}>
            <Plus className="w-4 h-4 mr-2" />
            Add Sub-issue
          </Link>
        </Button>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full">
          <Label htmlFor="existing-sub-issue">Add existing issue</Label>
          <select
            id="existing-sub-issue"
            value={existingChildId}
            onChange={(event) =>
              onExistingChildChange(
                event.target.value ? (event.target.value as Id<"tickets">) : ""
              )
            }
            className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select an issue</option>
            {selectOptions}
          </select>
          {!hasCandidates && (
            <p className="mt-2 text-xs text-muted-foreground">
              No available issues to add.
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={onAddExisting}
          disabled={!existingChildId || isAddingExisting}
        >
          {isAddingExisting ? "Adding..." : "Add existing"}
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {subIssues.length === 0 && (
          <p className="text-sm text-muted-foreground">No sub-issues yet.</p>
        )}
        {subIssues.map((child) => (
          <div
            key={child._id}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2"
          >
            <div>
              <Link
                href={`/workspace/${workspaceId}/tickets/${child._id}`}
                className="font-medium hover:text-primary"
              >
                {child.title}
              </Link>
              <div className="text-xs text-muted-foreground font-mono">
                {formatTicketNumber(workspacePrefix, child.number) ?? "—"}
              </div>
            </div>
            <IssueStatusBadge status={child.status} />
          </div>
        ))}
      </div>
    </Card>
  );
}
