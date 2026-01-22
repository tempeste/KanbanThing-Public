"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  LayoutGrid,
  ListTree,
  Plus,
  Trash2,
} from "lucide-react";
import { TicketModal } from "@/components/ticket-modal";
import { FeatureDocViewer } from "@/components/feature-doc-viewer";
import { formatDocNumber } from "@/lib/utils";

type FeatureDoc = Doc<"featureDocs">;
type Ticket = Doc<"tickets">;
type Status = "unclaimed" | "in_progress" | "done";

const STATUS_LABELS: Record<Status, string> = {
  unclaimed: "Unclaimed",
  in_progress: "In Progress",
  done: "Done",
};

const STATUS_STYLES: Record<Status, string> = {
  unclaimed: "bg-unclaimed/15 text-unclaimed border-unclaimed/30",
  in_progress: "bg-in-progress/15 text-in-progress border-in-progress/30",
  done: "bg-done/15 text-done border-done/30",
};

interface FeatureDocsProps {
  workspaceId: Id<"workspaces">;
  docs: FeatureDoc[];
  tickets: Ticket[];
  workspacePrefix: string;
  selectedDocId?: Id<"featureDocs"> | null;
}

export function FeatureDocs({
  workspaceId,
  docs,
  tickets,
  workspacePrefix,
  selectedDocId,
}: FeatureDocsProps) {
  const createDoc = useMutation(api.featureDocs.create);
  const updateDoc = useMutation(api.featureDocs.update);
  const deleteDoc = useMutation(api.featureDocs.remove);
  const setArchived = useMutation(api.featureDocs.setArchived);
  const setStatusMutation = useMutation(api.featureDocs.setStatus);
  const moveDoc = useMutation(api.featureDocs.move);
  const updateTicket = useMutation(api.tickets.update);

  const [open, setOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<FeatureDoc | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [parentDocId, setParentDocId] = useState<Id<"featureDocs"> | null>(null);
  const [status, setStatus] = useState<Status>("unclaimed");
  const [isSaving, setIsSaving] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketDocId, setTicketDocId] = useState<Id<"featureDocs"> | null>(null);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [highlightedDocId, setHighlightedDocId] = useState<Id<"featureDocs"> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<FeatureDoc | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "unclaimed" | "in_progress" | "done"
  >("all");
  const [sortBy, setSortBy] = useState<"manual" | "created" | "updated" | "title" | "status">(
    "updated"
  );
  const [viewMode, setViewMode] = useState<"grid" | "tree">("grid");
  const [collapsedDocs, setCollapsedDocs] = useState<Set<string>>(new Set());
  const [, setDraggingDocId] = useState<Id<"featureDocs"> | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<Id<"featureDocs"> | null>(null);
  const [dragOverDocPosition, setDragOverDocPosition] = useState<"above" | "below" | null>(
    null
  );
  const [optimisticDocOrders, setOptimisticDocOrders] = useState<Map<string, number>>(
    new Map()
  );
  const docPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (editingDoc) {
      setTitle(editingDoc.title);
      setContent(editingDoc.content);
      setParentDocId(editingDoc.parentDocId ?? null);
      setStatus(editingDoc.status ?? "unclaimed");
    } else {
      setTitle("");
      setContent("");
      setParentDocId(null);
      setStatus("unclaimed");
    }
  }, [editingDoc, open]);

  useEffect(() => {
    if (!optimisticDocOrders.size) return;
    setOptimisticDocOrders((prev) => {
      const next = new Map(prev);
      for (const doc of docs) {
        const override = next.get(doc._id);
        if (override !== undefined && override === (doc.order ?? doc.createdAt)) {
          next.delete(doc._id);
        }
      }
      return next;
    });
  }, [docs, optimisticDocOrders.size]);

  const docsById = useMemo(
    () => new Map(docs.map((doc) => [doc._id, doc])),
    [docs]
  );

  const displayDocs = useMemo(() => {
    if (!optimisticDocOrders.size) return docs;
    return docs.map((doc) => {
      const override = optimisticDocOrders.get(doc._id);
      if (override === undefined) return doc;
      return { ...doc, order: override };
    });
  }, [docs, optimisticDocOrders]);

  const isArchivedDoc = (doc: FeatureDoc) => doc.archived ?? false;
  const isArchivedTicket = (ticket: Ticket) => ticket.archived ?? false;
  const getDocOrder = (doc: FeatureDoc) => doc.order ?? doc.createdAt;

  const visibleDocs = useMemo(() => {
    if (showArchived) return displayDocs;
    return displayDocs.filter((doc) => !isArchivedDoc(doc));
  }, [displayDocs, showArchived]);

  const filteredDocs = useMemo(() => {
    if (statusFilter === "all") return visibleDocs;
    return visibleDocs.filter((doc) => (doc.status ?? "unclaimed") === statusFilter);
  }, [visibleDocs, statusFilter]);

  const visibleTickets = useMemo(() => {
    if (showArchived) return tickets;
    return tickets.filter((ticket) => !isArchivedTicket(ticket));
  }, [tickets, showArchived]);

  const ticketCounts = useMemo(() => {
    return visibleTickets.reduce<Record<string, number>>((acc, ticket) => {
      if (ticket.docId) {
        acc[ticket.docId] = (acc[ticket.docId] ?? 0) + 1;
      }
      return acc;
    }, {});
  }, [visibleTickets]);

  const ticketsByDoc = useMemo(() => {
    return visibleTickets.reduce<Record<string, Ticket[]>>((acc, ticket) => {
      if (ticket.docId) {
        if (!acc[ticket.docId]) acc[ticket.docId] = [];
        acc[ticket.docId].push(ticket);
      }
      return acc;
    }, {});
  }, [visibleTickets]);

  const sortedDocs = useMemo(() => {
    const statusRank: Record<Status, number> = {
      unclaimed: 0,
      in_progress: 1,
      done: 2,
    };
    const list = filteredDocs.slice();
    list.sort((a, b) => {
      if (sortBy === "manual") {
        return getDocOrder(a) - getDocOrder(b);
      }
      if (sortBy === "created") {
        return b.createdAt - a.createdAt;
      }
      if (sortBy === "updated") {
        return b.updatedAt - a.updatedAt;
      }
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === "status") {
        const rank =
          statusRank[a.status ?? "unclaimed"] - statusRank[b.status ?? "unclaimed"];
        if (rank !== 0) return rank;
        return b.updatedAt - a.updatedAt;
      }
      return 0;
    });
    return list;
  }, [filteredDocs, sortBy]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, FeatureDoc[]>();
    const ids = new Set(sortedDocs.map((doc) => doc._id));
    for (const doc of sortedDocs) {
      const parentKey =
        doc.parentDocId && ids.has(doc.parentDocId) ? doc.parentDocId : "root";
      const list = map.get(parentKey) ?? [];
      list.push(doc);
      map.set(parentKey, list);
    }
    return map;
  }, [sortedDocs]);

  const aggregatedCounts = useMemo(() => {
    const cache = new Map<string, number>();
    const countFor = (docId: string): number => {
      if (cache.has(docId)) return cache.get(docId)!;
      const direct = ticketCounts[docId] ?? 0;
      const children = childrenByParent.get(docId) ?? [];
      const total = children.reduce((sum, child) => sum + countFor(child._id), direct);
      cache.set(docId, total);
      return total;
    };
    const totals: Record<string, number> = {};
    for (const doc of sortedDocs) {
      totals[doc._id] = countFor(doc._id);
    }
    return totals;
  }, [childrenByParent, sortedDocs, ticketCounts]);

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

  useEffect(() => {
    if (!selectedDocId) return;
    const doc = docsById.get(selectedDocId);
    if (doc && isArchivedDoc(doc)) {
      setShowArchived(true);
    }
  }, [selectedDocId, docsById]);

  useEffect(() => {
    if (!viewerDoc) return;
    const updated = docsById.get(viewerDoc._id);
    if (updated && updated !== viewerDoc) {
      setViewerDoc(updated);
    }
  }, [docsById, viewerDoc]);

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
          parentDocId: parentDocId ?? null,
          status,
        });
      } else {
        await createDoc({
          workspaceId,
          title: title.trim(),
          content: content.trim(),
          parentDocId: parentDocId ?? null,
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

  const toggleCollapsed = (docId: Id<"featureDocs">) => {
    setCollapsedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const applyOptimisticDocOrder = (docId: Id<"featureDocs">, order: number) => {
    setOptimisticDocOrders((prev) => {
      const next = new Map(prev);
      next.set(docId, order);
      return next;
    });
  };

  const calculateDocOrder = (
    targetId: Id<"featureDocs">,
    position: "above" | "below",
    draggingId: Id<"featureDocs">
  ) => {
    const list = sortedDocs.filter((doc) => doc._id !== draggingId);
    const targetIndex = list.findIndex((doc) => doc._id === targetId);
    if (targetIndex === -1) return null;
    const prevDoc = position === "above" ? list[targetIndex - 1] : list[targetIndex];
    const nextDoc = position === "above" ? list[targetIndex] : list[targetIndex + 1];
    if (prevDoc && nextDoc) {
      return (getDocOrder(prevDoc) + getDocOrder(nextDoc)) / 2;
    }
    if (!prevDoc && nextDoc) {
      return getDocOrder(nextDoc) - 1000;
    }
    if (prevDoc && !nextDoc) {
      return getDocOrder(prevDoc) + 1000;
    }
    return Date.now();
  };

  const handleDocDrop = async (
    event: React.DragEvent,
    targetId: Id<"featureDocs">
  ) => {
    event.preventDefault();
    const docId = event.dataTransfer.getData("application/x-doc-id") as Id<"featureDocs">;
    if (!docId || docId === targetId) return;
    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const isAbove = event.clientY < rect.top + rect.height / 2;
    const newOrder = calculateDocOrder(targetId, isAbove ? "above" : "below", docId);
    if (newOrder === null) return;
    applyOptimisticDocOrder(docId, newOrder);
    try {
      await moveDoc({ id: docId, order: newOrder });
    } finally {
      setDragOverDocId(null);
      setDragOverDocPosition(null);
      setDraggingDocId(null);
      docPreviewRef.current = null;
    }
  };

  const handleTicketDrop = async (
    event: React.DragEvent,
    targetDocId: Id<"featureDocs">
  ) => {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData("text/plain") as Id<"tickets">;
    if (!ticketId) return;
    await updateTicket({ id: ticketId, docId: targetDocId });
    setDragOverDocId(null);
    setDragOverDocPosition(null);
  };

  const handleUngroupedDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData("text/plain") as Id<"tickets">;
    if (!ticketId) return;
    await updateTicket({ id: ticketId, docId: null });
  };

  const renderDocCard = (doc: FeatureDoc) => {
    const docNumber = formatDocNumber(workspacePrefix, doc.number);
    const docStatus = doc.status ?? "unclaimed";
    const isArchived = isArchivedDoc(doc);
    const ticketCount = aggregatedCounts[doc._id] ?? 0;
    const canDrag = sortBy === "manual" && viewMode === "grid";
    const isHighlighted = highlightedDocId === doc._id;

    return (
      <Card
        key={doc._id}
        id={`doc-${doc._id}`}
        className={`group transition-colors ${
          dragOverDocId === doc._id
            ? dragOverDocPosition === "above"
              ? "ring-2 ring-primary/60"
              : dragOverDocPosition === "below"
                ? "ring-2 ring-primary/30"
                : "ring-2 ring-primary/40"
            : isHighlighted
              ? "ring-2 ring-primary/60"
              : "hover:border-primary/50"
        } ${isArchived ? "opacity-60" : ""}`}
        style={undefined}
        onDragOver={(event) => {
          event.preventDefault();
          const isDocDrag = event.dataTransfer.types.includes("application/x-doc-id");
          const isTicketDrag = event.dataTransfer.types.includes("text/plain");
          if (isDocDrag && canDrag) {
            const draggedId = event.dataTransfer.getData(
              "application/x-doc-id"
            ) as Id<"featureDocs">;
            if (!draggedId || draggedId === doc._id) return;
            setDragOverDocId(doc._id);
            const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
            const isAbove = event.clientY < rect.top + rect.height / 2;
            setDragOverDocPosition(isAbove ? "above" : "below");
            const previewOrder = calculateDocOrder(
              doc._id,
              isAbove ? "above" : "below",
              draggedId
            );
            if (previewOrder === null) return;
            const nextKey = `${draggedId}:${previewOrder}`;
            if (docPreviewRef.current !== nextKey) {
              docPreviewRef.current = nextKey;
              applyOptimisticDocOrder(draggedId, previewOrder);
            }
            return;
          }
          if (isTicketDrag && !isArchived) {
            setDragOverDocId(doc._id);
            setDragOverDocPosition(null);
          }
        }}
        onDragLeave={() => {
          setDragOverDocId(null);
          setDragOverDocPosition(null);
        }}
        onDrop={(event) => {
          const docDragId = event.dataTransfer.getData("application/x-doc-id");
          if (docDragId && canDrag) {
            handleDocDrop(event, doc._id);
            return;
          }
          if (!isArchived) {
            handleTicketDrop(event, doc._id);
          }
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {canDrag && (
                <button
                  type="button"
                  className="mt-1 text-muted-foreground hover:text-primary"
                  draggable
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.setData("application/x-doc-id", doc._id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingDocId(doc._id);
                    docPreviewRef.current = null;
                  }}
                  onDragEnd={() => {
                    setDraggingDocId(null);
                    setDragOverDocId(null);
                    setDragOverDocPosition(null);
                    docPreviewRef.current = null;
                  }}
                  title="Drag to reorder"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
              )}
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {docNumber ? (
                    <span className="text-xs text-muted-foreground mr-2">{docNumber}</span>
                  ) : null}
                  {doc.title}
                </CardTitle>
                <CardDescription>
                  Updated {new Date(doc.updatedAt).toLocaleDateString()}
                </CardDescription>
                {doc.parentDocId && docsById.get(doc.parentDocId) && (
                  <button
                    type="button"
                    onClick={() => {
                      const parentId = doc.parentDocId!;
                      const element = document.getElementById(`doc-${parentId}`);
                      if (element) {
                        element.scrollIntoView({ behavior: "smooth", block: "center" });
                        setHighlightedDocId(parentId);
                        setTimeout(() => setHighlightedDocId(null), 2000);
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    Parent: {docsById.get(doc.parentDocId)!.title}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${STATUS_STYLES[docStatus]}`}>
                {STATUS_LABELS[docStatus]}
              </Badge>
              <select
                value={docStatus}
                onChange={(event) =>
                  setStatusMutation({
                    id: doc._id,
                    status: event.target.value as Status,
                  })
                }
                className="flex h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
              {isArchived && (
                <Badge variant="outline" className="text-xs">
                  Archived
                </Badge>
              )}
              <Badge variant="secondary">
                {ticketCount} ticket{ticketCount === 1 ? "" : "s"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-primary"
                onClick={() => setArchived({ id: doc._id, archived: !isArchived })}
                title={isArchived ? "Unarchive doc" : "Archive doc"}
              >
                {isArchived ? (
                  <ArchiveRestore className="w-4 h-4" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
              </Button>
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
            <Markdown content={doc.content} className="text-sm max-h-24 overflow-hidden" />
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
                className={`text-left text-sm hover:text-primary transition-colors ${
                  isArchivedTicket(ticket) ? "text-muted-foreground line-through" : ""
                }`}
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
              onClick={() => setViewerDoc(doc)}
            >
              View Doc
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingDoc(doc);
                setOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              disabled={isArchived}
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
    );
  };

  const roots = childrenByParent.get("root") ?? [];

  const renderTree = (doc: FeatureDoc, depth = 0) => {
    const children = childrenByParent.get(doc._id) ?? [];
    const isCollapsed = collapsedDocs.has(doc._id);
    return (
      <div key={doc._id} className="space-y-3">
        <div className="flex items-start gap-2" style={{ marginLeft: depth * 20 }}>
          {children.length > 0 && (
            <button
              type="button"
              onClick={() => toggleCollapsed(doc._id)}
              className="mt-2 text-muted-foreground hover:text-primary"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}
          {renderDocCard(doc)}
        </div>
        {!isCollapsed &&
          children.map((child) => (
            <div key={child._id}>
              {renderTree(child, depth + 1)}
            </div>
          ))}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Feature Docs</h2>
            <p className="text-sm text-muted-foreground">
              Group related tickets under a shared doc for larger context. Keep tickets small.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showArchived ? "default" : "outline"}
              onClick={() => setShowArchived((prev) => !prev)}
            >
              {showArchived ? "Hide Archived" : "Show Archived"}
            </Button>
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "unclaimed", "in_progress", "done"] as const).map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={statusFilter === filter ? "default" : "outline"}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === "all" ? "All" : STATUS_LABELS[filter]}
            </Button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <Label htmlFor="doc-sort" className="text-xs text-muted-foreground">
              Sort
            </Label>
            <select
              id="doc-sort"
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as "manual" | "created" | "updated" | "title" | "status")
              }
              className="flex h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="title">Title</option>
              <option value="status">Status</option>
              <option value="manual">Manual</option>
            </select>
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "tree" ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode("tree")}
              >
                <ListTree className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mb-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleUngroupedDrop}
      >
        Drop tickets here to ungroup them from any feature doc.
      </div>

      {sortedDocs.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No feature docs yet. Create one to group related tickets.
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {sortedDocs.map((doc) => renderDocCard(doc))}
        </div>
      ) : (
        <div className="space-y-4">
          {roots.map((doc) => renderTree(doc))}
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
              <Label htmlFor="parent-doc">Parent Feature Doc</Label>
              <select
                id="parent-doc"
                value={parentDocId ?? ""}
                onChange={(event) =>
                  setParentDocId(
                    event.target.value ? (event.target.value as Id<"featureDocs">) : null
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">No parent</option>
                {docs
                  .filter((doc) => !editingDoc || doc._id !== editingDoc._id)
                  .map((doc) => {
                    const docNumber = formatDocNumber(workspacePrefix, doc.number);
                    return (
                      <option key={doc._id} value={doc._id}>
                        {docNumber ? `${docNumber} · ${doc.title}` : doc.title}
                      </option>
                    );
                  })}
              </select>
            </div>

            {editingDoc && (
              <div className="space-y-2">
                <Label htmlFor="doc-status">Status</Label>
                <select
                  id="doc-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as Status)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

      {viewerDoc && (
        <FeatureDocViewer
          doc={viewerDoc}
          tickets={tickets}
          workspacePrefix={workspacePrefix}
          open={true}
          onOpenChange={(value) => {
            if (!value) setViewerDoc(null);
          }}
          onEdit={() => {
            setViewerDoc(null);
            setEditingDoc(viewerDoc);
            setOpen(true);
          }}
          onSetStatus={(nextStatus) => {
            setStatusMutation({ id: viewerDoc._id, status: nextStatus });
          }}
          onArchiveToggle={() => {
            setArchived({ id: viewerDoc._id, archived: !(viewerDoc.archived ?? false) });
          }}
          onSelectTicket={(ticket) => {
            setEditingTicket(ticket);
            setTicketModalOpen(true);
          }}
        />
      )}

      <TicketModal
        workspaceId={workspaceId}
        featureDocs={docs}
        tickets={tickets}
        workspacePrefix={workspacePrefix}
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
