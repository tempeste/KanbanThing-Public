"use client";

import { useMemo } from "react";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/markdown";
import { Archive, ArchiveRestore, FileText } from "lucide-react";
import { formatDocNumber, formatTicketNumber } from "@/lib/utils";

type FeatureDoc = Doc<"featureDocs">;
type Ticket = Doc<"tickets">;
type Status = "unclaimed" | "in_progress" | "done";

const STATUS_LABELS: Record<Status, string> = {
  unclaimed: "Unclaimed",
  in_progress: "In Progress",
  done: "Done",
};

const STATUS_BADGES: Record<Status, string> = {
  unclaimed: "bg-unclaimed/20 text-unclaimed border-unclaimed/30",
  in_progress: "bg-in-progress/20 text-in-progress border-in-progress/30",
  done: "bg-done/20 text-done border-done/30",
};

interface FeatureDocViewerProps {
  doc: FeatureDoc;
  tickets: Ticket[];
  workspacePrefix: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onSetStatus: (status: Status) => void;
  onArchiveToggle: () => void;
  onSelectTicket: (ticket: Ticket) => void;
}

export function FeatureDocViewer({
  doc,
  tickets,
  workspacePrefix,
  open,
  onOpenChange,
  onEdit,
  onSetStatus,
  onArchiveToggle,
  onSelectTicket,
}: FeatureDocViewerProps) {
  const relatedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.docId === doc._id),
    [tickets, doc._id]
  );
  const docNumber = formatDocNumber(workspacePrefix, doc.number);
  const status = doc.status ?? "unclaimed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="p-2 rounded-md bg-primary/10 text-primary">
                <FileText className="w-4 h-4" />
              </span>
              {docNumber ? (
                <span className="text-sm text-muted-foreground">{docNumber}</span>
              ) : null}
              <span>{doc.title}</span>
            </span>
            {doc.archived ? (
              <Badge variant="outline" className="text-xs">
                Archived
              </Badge>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`gap-1 ${STATUS_BADGES[status]}`}>
              {STATUS_LABELS[status]}
            </Badge>
            <select
              value={status}
              onChange={(event) => onSetStatus(event.target.value as Status)}
              className="flex h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit Doc
            </Button>
            <Button variant="outline" size="sm" onClick={onArchiveToggle}>
              {doc.archived ? (
                <ArchiveRestore className="w-4 h-4 mr-2" />
              ) : (
                <Archive className="w-4 h-4 mr-2" />
              )}
              {doc.archived ? "Unarchive" : "Archive"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4 max-h-[50vh] overflow-auto">
          {doc.content ? (
            <Markdown content={doc.content} />
          ) : (
            <p className="text-sm text-muted-foreground">No documentation yet.</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Associated Tickets</h3>
            <Badge variant="secondary">{relatedTickets.length}</Badge>
          </div>
          {relatedTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets grouped under this doc yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {relatedTickets.map((ticket) => (
                <button
                  key={ticket._id}
                  onClick={() => onSelectTicket(ticket)}
                  className="rounded-md border bg-background px-3 py-2 text-left text-sm hover:border-primary/60 hover:text-primary transition-colors"
                >
                  <div className="text-xs text-muted-foreground">
                    {formatTicketNumber(workspacePrefix, ticket.number) ?? "Ticket"}
                  </div>
                  <div className="font-medium">{ticket.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {STATUS_LABELS[ticket.status]}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
