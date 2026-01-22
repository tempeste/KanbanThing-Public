"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Plus, Trash2 } from "lucide-react";
import { TicketModal } from "@/components/ticket-modal";

type FeatureDoc = Doc<"featureDocs">;
type Ticket = Doc<"tickets">;

interface FeatureDocsProps {
  workspaceId: Id<"workspaces">;
  docs: FeatureDoc[];
  tickets: Ticket[];
  selectedDocId?: Id<"featureDocs"> | null;
}

export function FeatureDocs({
  workspaceId,
  docs,
  tickets,
  selectedDocId,
}: FeatureDocsProps) {
  const createDoc = useMutation(api.featureDocs.create);
  const updateDoc = useMutation(api.featureDocs.update);
  const deleteDoc = useMutation(api.featureDocs.remove);

  const [open, setOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<FeatureDoc | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketDocId, setTicketDocId] = useState<Id<"featureDocs"> | null>(null);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [highlightedDocId, setHighlightedDocId] = useState<Id<"featureDocs"> | null>(null);

  useEffect(() => {
    if (editingDoc) {
      setTitle(editingDoc.title);
      setContent(editingDoc.content);
    } else {
      setTitle("");
      setContent("");
    }
  }, [editingDoc, open]);

  const ticketCounts = useMemo(() => {
    return tickets.reduce<Record<string, number>>((acc, ticket) => {
      if (ticket.docId) {
        acc[ticket.docId] = (acc[ticket.docId] ?? 0) + 1;
      }
      return acc;
    }, {});
  }, [tickets]);

  const ticketsByDoc = useMemo(() => {
    return tickets.reduce<Record<string, Ticket[]>>((acc, ticket) => {
      if (ticket.docId) {
        if (!acc[ticket.docId]) acc[ticket.docId] = [];
        acc[ticket.docId].push(ticket);
      }
      return acc;
    }, {});
  }, [tickets]);

  useEffect(() => {
    if (!selectedDocId) return;
    const element = document.getElementById(`doc-${selectedDocId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedDocId(selectedDocId);
      const timeout = setTimeout(() => setHighlightedDocId(null), 2000);
      return () => clearTimeout(timeout);
    }
  }, [selectedDocId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      if (editingDoc) {
        await updateDoc({
          id: editingDoc._id,
          title: title.trim(),
          content: content.trim(),
        });
      } else {
        await createDoc({
          workspaceId,
          title: title.trim(),
          content: content.trim(),
        });
      }
      setOpen(false);
      setEditingDoc(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (doc: FeatureDoc) => {
    if (confirm("Delete this doc? Tickets will be ungrouped.")) {
      await deleteDoc({ id: doc._id });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Feature Docs</h2>
          <p className="text-sm text-muted-foreground">
            Group related tickets under a shared doc for larger context. Keep tickets small.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingDoc(null);
            setOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Doc
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No feature docs yet. Create one to group related tickets.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {docs.map((doc) => (
            <Card
              key={doc._id}
              id={`doc-${doc._id}`}
              className={`group hover:border-primary/50 transition-colors ${
                highlightedDocId === doc._id ? "ring-2 ring-primary/60" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{doc.title}</CardTitle>
                      <CardDescription>
                        Updated {new Date(doc.updatedAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {ticketCounts[doc._id] ?? 0} ticket
                      {(ticketCounts[doc._id] ?? 0) === 1 ? "" : "s"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(doc)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {doc.content ? (
                  <Markdown
                    content={doc.content}
                    className="text-sm max-h-24 overflow-hidden"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No content yet.</p>
                )}
                <div className="space-y-2">
                  {(ticketsByDoc[doc._id] ?? []).slice(0, 3).map((ticket) => (
                    <button
                      key={ticket._id}
                      onClick={() => {
                        setEditingTicket(ticket);
                        setTicketModalOpen(true);
                      }}
                      className="text-left text-sm hover:text-primary transition-colors"
                    >
                      • {ticket.title}
                    </button>
                  ))}
                  {(ticketsByDoc[doc._id]?.length ?? 0) > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{(ticketsByDoc[doc._id]?.length ?? 0) - 3} more tickets
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingDoc(doc);
                      setOpen(true);
                    }}
                  >
                    Open Doc
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingTicket(null);
                      setTicketDocId(doc._id);
                      setTicketModalOpen(true);
                    }}
                  >
                    Add Ticket
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setEditingDoc(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Edit Feature Doc" : "Create Feature Doc"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                placeholder="Subscription feature"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-content">Documentation (Markdown)</Label>
              <Textarea
                id="doc-content"
                placeholder="# Context&#10;&#10;## Goals&#10;- ...&#10;&#10;## Notes&#10;- ..."
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={14}
                className="font-mono text-sm"
              />
            </div>
            {content.trim() && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <Markdown
                  content={content}
                  className="rounded-md border bg-muted/30 p-3 max-h-64 overflow-auto"
                />
              </div>
            )}

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || isSaving}>
                {isSaving ? "Saving..." : editingDoc ? "Save Changes" : "Create Doc"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TicketModal
        workspaceId={workspaceId}
        featureDocs={docs}
        initialDocId={ticketDocId ?? undefined}
        ticket={editingTicket ?? undefined}
        open={ticketModalOpen}
        onOpenChange={(value) => {
          setTicketModalOpen(value);
          if (!value) {
            setTicketDocId(null);
            setEditingTicket(null);
          }
        }}
      />
    </>
  );
}
