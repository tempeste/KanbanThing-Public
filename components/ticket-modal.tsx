"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMemo, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type Ticket = Doc<"tickets">;
type FeatureDoc = Doc<"featureDocs">;

interface TicketModalProps {
  workspaceId: Id<"workspaces">;
  featureDocs: FeatureDoc[];
  initialDocId?: Id<"featureDocs">;
  ticket?: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TicketModal({
  workspaceId,
  featureDocs,
  initialDocId,
  ticket,
  open,
  onOpenChange,
}: TicketModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [docId, setDocId] = useState<Id<"featureDocs"> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const createTicket = useMutation(api.tickets.create);
  const updateTicket = useMutation(api.tickets.update);

  const isEditing = !!ticket;
  const activeDoc = useMemo(
    () => (docId ? featureDocs.find((doc) => doc._id === docId) ?? null : null),
    [docId, featureDocs]
  );

  useEffect(() => {
    if (!open) return;
    if (ticket) {
      setTitle(ticket.title);
      setDescription(ticket.description);
      setDocId(ticket.docId ?? null);
    } else {
      setTitle("");
      setDescription("");
      setDocId(initialDocId ?? null);
    }
  }, [ticket, open, initialDocId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      if (isEditing) {
        await updateTicket({
          id: ticket._id,
          title: title.trim(),
          description: description.trim(),
          docId: docId ?? null,
        });
      } else {
        await createTicket({
          workspaceId,
          title: title.trim(),
          description: description.trim(),
          docId: docId ?? undefined,
        });
      }
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Ticket" : "Create Ticket"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Ticket title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Description
              <span className="text-muted-foreground ml-2 font-normal">
                - keep this ralph-sized (single, small change)
              </span>
            </Label>
            <Textarea
              id="description"
              placeholder="Add price modal with monthly/annual toggle..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="docId">Feature Doc</Label>
            <select
              id="docId"
              value={docId ?? ""}
              onChange={(e) =>
                setDocId(e.target.value ? (e.target.value as Id<"featureDocs">) : null)
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">No doc (ungrouped)</option>
              {featureDocs.map((doc) => (
                <option
                  key={doc._id}
                  value={doc._id}
                  disabled={doc.archived && doc._id !== docId}
                >
                  {doc.title}
                  {doc.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
            {featureDocs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Create a feature doc to group related tickets.
              </p>
            )}
          </div>

          {activeDoc && (
            <div className="flex items-center justify-between rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">{activeDoc.title}</p>
                <p className="text-xs text-muted-foreground">
                  Open the feature doc for full context.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  router.push(`${pathname}?tab=feature-docs&doc=${activeDoc._id}`);
                  onOpenChange(false);
                }}
              >
                Open Doc
              </Button>
            </div>
          )}

          {isEditing && ticket && (
            <div className="pt-4 border-t">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium">Status:</span> {ticket.status.replace("_", " ")}
                </p>
                {ticket.ownerId && (
                  <p>
                    <span className="font-medium">Owner:</span> {ticket.ownerId} ({ticket.ownerType})
                  </p>
                )}
                <p>
                  <span className="font-medium">Created:</span>{" "}
                  {new Date(ticket.createdAt).toLocaleString()}
                </p>
                <p>
                  <span className="font-medium">Updated:</span>{" "}
                  {new Date(ticket.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isSubmitting}>
              {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Create Ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
