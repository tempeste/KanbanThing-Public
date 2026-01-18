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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";

type Ticket = Doc<"tickets">;

interface TicketModalProps {
  workspaceId: Id<"workspaces">;
  ticket?: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TicketModal({ workspaceId, ticket, open, onOpenChange }: TicketModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [docs, setDocs] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTicket = useMutation(api.tickets.create);
  const updateTicket = useMutation(api.tickets.update);

  const isEditing = !!ticket;

  useEffect(() => {
    if (ticket) {
      setTitle(ticket.title);
      setDescription(ticket.description);
      setDocs(ticket.docs || "");
    } else {
      setTitle("");
      setDescription("");
      setDocs("");
    }
  }, [ticket, open]);

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
          docs: docs.trim() || undefined,
        });
      } else {
        await createTicket({
          workspaceId,
          title: title.trim(),
          description: description.trim(),
          docs: docs.trim() || undefined,
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

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="docs">Docs</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
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
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what needs to be done..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>

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
            </TabsContent>

            <TabsContent value="docs" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="docs">
                  Documentation (Markdown)
                  <span className="text-muted-foreground ml-2 font-normal">
                    - Add context, relevant files, acceptance criteria
                  </span>
                </Label>
                <Textarea
                  id="docs"
                  placeholder="# Context&#10;&#10;## Relevant Files&#10;- src/...&#10;&#10;## Acceptance Criteria&#10;- [ ] ..."
                  value={docs}
                  onChange={(e) => setDocs(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>
          </Tabs>

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
