"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  startTransition,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { TicketTableRow } from "@/components/ticket-table-row";
import { DispatchTicketsButton } from "@/components/dispatch-tickets-button";
import { IssueStatus } from "@/components/issue-status";
import { useWorkspaceData } from "@/components/workspace-data-provider";
import {
  deriveChildrenByParent,
  deriveSortedFlatRows,
  deriveTreeRows,
  deriveVisibleTickets,
  getTicketOrderValue,
  SortColumn,
  SortDirection,
} from "@/lib/ticket-derivations";
import { beginTicketDrag, endTicketDrag } from "@/lib/ticket-drag";
import { TicketSummary } from "@/lib/ticket-summary";
import { ChevronDown, ChevronUp, Archive, ArchiveRestore, Trash2, X } from "lucide-react";

interface TicketTableProps {
  workspaceId: Id<"workspaces">;
  tickets: TicketSummary[];
  workspacePrefix: string;
  showArchived: boolean;
  statusFilter: Set<IssueStatus>;
  onStatusFilterChange: (next: Set<IssueStatus>) => void;
  compact?: boolean;
  persistKey?: string;
  toolbarAction?: ReactNode;
}

type DragOverPosition = "above" | "below" | "inside" | null;

const ALL_FILTER_STATUSES: IssueStatus[] = [
  "backlog",
  "unclaimed",
  "dispatched",
  "in_progress",
  "done",
];

export function TicketTable({
  workspaceId,
  tickets,
  workspacePrefix,
  showArchived,
  statusFilter,
  onStatusFilterChange,
  persistKey,
  toolbarAction,
}: TicketTableProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragOverId, setDragOverId] = useState<Id<"tickets"> | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<DragOverPosition>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    Map<string, { parentId: Id<"tickets"> | null; order: number }>
  >(new Map());
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Map<string, IssueStatus>
  >(new Map());
  const [optimisticArchived, setOptimisticArchived] = useState<Map<string, boolean>>(
    new Map()
  );
  const [selected, setSelected] = useState<Set<Id<"tickets">>>(new Set());
  const allStatusCount = ALL_FILTER_STATUSES.length;
  const [sort, setSort] = useState<{ col: SortColumn; dir: SortDirection } | null>(null);
  const [sortRestoredKey, setSortRestoredKey] = useState<string | null>(null);
  const [bulkArchivePending, setBulkArchivePending] = useState<null | boolean>(null);
  const [colWidths, setColWidths] = useState({
    id: 160,
    assignee: 160,
    status: 120,
    actions: 100,
  });
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;
  const gridTemplate = `${colWidths.id}px minmax(0,1fr) ${colWidths.assignee}px ${colWidths.status}px ${colWidths.actions}px`;

  const listRef = useRef<HTMLDivElement | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const prefetchedTicketIdsRef = useRef<Set<string>>(new Set());
  const pendingDragStateRef = useRef<{
    id: Id<"tickets"> | null;
    position: DragOverPosition;
  } | null>(null);
  const { tags: workspaceTags } = useWorkspaceData();

  const updateStatus = useMutation(api.tickets.updateStatus);
  const updateTicket = useMutation(api.tickets.update);
  const deleteTicket = useMutation(api.tickets.remove);
  const bulkArchive = useMutation(api.tickets.bulkArchive);
  const bulkDelete = useMutation(api.tickets.bulkDelete);

  const sortStorageKey = persistKey ? `kanbanthing:${persistKey}:table-sort` : null;

  useEffect(() => {
    if (!sortStorageKey) return;
    setSortRestoredKey(null);
    const raw = window.localStorage.getItem(sortStorageKey);
    if (!raw) {
      setSort(null);
      setSortRestoredKey(sortStorageKey);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { col?: SortColumn; dir?: SortDirection } | null;
      if (
        parsed &&
        (parsed.col === "number" ||
          parsed.col === "title" ||
          parsed.col === "assignee" ||
          parsed.col === "status") &&
        (parsed.dir === "asc" || parsed.dir === "desc")
      ) {
        setSort({ col: parsed.col, dir: parsed.dir });
      } else {
        setSort(null);
      }
    } catch {
      setSort(null);
    }
    setSortRestoredKey(sortStorageKey);
  }, [sortStorageKey]);

  useEffect(() => {
    if (!sortStorageKey || sortRestoredKey !== sortStorageKey) return;
    if (!sort) {
      window.localStorage.removeItem(sortStorageKey);
      return;
    }
    window.localStorage.setItem(sortStorageKey, JSON.stringify(sort));
  }, [sort, sortRestoredKey, sortStorageKey]);

  const resolvedOptimisticMoves = useMemo(() => {
    if (!optimisticMoves.size) return optimisticMoves;
    const next = new Map(optimisticMoves);
    for (const ticket of tickets) {
      const override = next.get(ticket._id);
      if (!override) continue;
      const currentOrder = ticket.order ?? ticket.createdAt;
      if (ticket.parentId === override.parentId && currentOrder === override.order) {
        next.delete(ticket._id);
      }
    }
    return next;
  }, [optimisticMoves, tickets]);

  const resolvedOptimisticStatuses = useMemo(() => {
    if (!optimisticStatuses.size) return optimisticStatuses;
    const next = new Map(optimisticStatuses);
    for (const ticket of tickets) {
      const status = next.get(ticket._id);
      if (!status) continue;
      if (ticket.status === status) {
        next.delete(ticket._id);
      }
    }
    return next;
  }, [optimisticStatuses, tickets]);

  const resolvedOptimisticArchived = useMemo(() => {
    if (!optimisticArchived.size) return optimisticArchived;
    const next = new Map(optimisticArchived);
    for (const ticket of tickets) {
      const archived = next.get(ticket._id);
      if (archived === undefined) continue;
      if ((ticket.archived ?? false) === archived) {
        next.delete(ticket._id);
      }
    }
    return next;
  }, [optimisticArchived, tickets]);

  const mergedTickets = useMemo(() => {
    if (
      !resolvedOptimisticMoves.size &&
      !resolvedOptimisticStatuses.size &&
      !resolvedOptimisticArchived.size
    ) {
      return tickets;
    }

    return tickets.map((ticket) => {
      const moveOverride = resolvedOptimisticMoves.get(ticket._id);
      const statusOverride = resolvedOptimisticStatuses.get(ticket._id);
      const archivedOverride = resolvedOptimisticArchived.get(ticket._id);

      return {
        ...ticket,
        parentId: moveOverride ? moveOverride.parentId : ticket.parentId,
        order: moveOverride ? moveOverride.order : ticket.order,
        status: statusOverride ?? ticket.status,
        archived: archivedOverride ?? ticket.archived,
        ownerId:
          statusOverride === "unclaimed" || statusOverride === "dispatched"
            ? undefined
            : ticket.ownerId,
        ownerType:
          statusOverride === "unclaimed" || statusOverride === "dispatched"
            ? undefined
            : ticket.ownerType,
        ownerDisplayName:
          statusOverride === "unclaimed" || statusOverride === "dispatched"
            ? undefined
            : ticket.ownerDisplayName,
      };
    });
  }, [tickets, resolvedOptimisticMoves, resolvedOptimisticStatuses, resolvedOptimisticArchived]);

  const allVisibleTickets = useMemo(
    () => deriveVisibleTickets(mergedTickets, showArchived),
    [mergedTickets, showArchived]
  );
  const visibleTickets = useMemo(
    () =>
      statusFilter.size === allStatusCount
        ? allVisibleTickets
        : allVisibleTickets.filter((t) => statusFilter.has(t.status)),
    [allVisibleTickets, statusFilter, allStatusCount]
  );
  const ticketsById = useMemo(
    () => new Map(visibleTickets.map((ticket) => [ticket._id, ticket])),
    [visibleTickets]
  );
  const childrenByParent = useMemo(
    () => deriveChildrenByParent(visibleTickets),
    [visibleTickets]
  );
  const treeRows = useMemo(
    () => deriveTreeRows(childrenByParent, collapsed),
    [childrenByParent, collapsed]
  );
  const displayRows = useMemo(
    () =>
      sort
        ? deriveSortedFlatRows(visibleTickets, sort.col, sort.dir)
        : treeRows,
    [sort, visibleTickets, treeRows]
  );

  const toggleStatusFilter = useCallback((status: IssueStatus) => {
    const next = new Set(statusFilter);
    if (next.has(status)) {
      if (next.size <= 1) return;
      next.delete(status);
    } else {
      next.add(status);
    }
    onStatusFilterChange(next);
  }, [onStatusFilterChange, statusFilter]);

  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getItemKey: (index) => displayRows[index]?.ticket._id ?? `row-${index}`,
    getScrollElement: () => listRef.current,
    estimateSize: () => 48,
    overscan: 12,
  });

  const cycleSort = useCallback((col: SortColumn) => {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  }, []);

  const flushDragState = useCallback(() => {
    dragRafRef.current = null;
    const next = pendingDragStateRef.current;
    pendingDragStateRef.current = null;
    if (!next) return;
    setDragOverId(next.id);
    setDragOverPosition(next.position);
  }, []);

  const scheduleDragState = useCallback(
    (id: Id<"tickets"> | null, position: DragOverPosition) => {
      pendingDragStateRef.current = { id, position };
      if (dragRafRef.current !== null) return;
      dragRafRef.current = requestAnimationFrame(flushDragState);
    },
    [flushDragState]
  );

  useEffect(
    () => () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    },
    []
  );

  useEffect(() => {
    rowVirtualizer.measure();
  }, [displayRows, rowVirtualizer]);

  const toggleCollapsed = (ticketId: Id<"tickets">) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  };

  const isDescendant = (ancestorId: Id<"tickets">, candidateId: Id<"tickets">) => {
    let current = ticketsById.get(candidateId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = ticketsById.get(current.parentId);
    }
    return false;
  };

  const calculateOrder = (
    siblings: TicketSummary[],
    targetId: Id<"tickets">,
    position: "above" | "below",
    draggingId: Id<"tickets">
  ) => {
    const list = siblings.filter((ticket) => ticket._id !== draggingId);
    const targetIndex = list.findIndex((ticket) => ticket._id === targetId);
    if (targetIndex === -1) return null;
    const prevTicket =
      position === "above" ? list[targetIndex - 1] : list[targetIndex];
    const nextTicket =
      position === "above" ? list[targetIndex] : list[targetIndex + 1];

    if (prevTicket && nextTicket) {
      return (getTicketOrderValue(prevTicket) + getTicketOrderValue(nextTicket)) / 2;
    }
    if (!prevTicket && nextTicket) {
      return getTicketOrderValue(nextTicket) - 1000;
    }
    if (prevTicket && !nextTicket) {
      return getTicketOrderValue(prevTicket) + 1000;
    }
    return list.length ? getTicketOrderValue(list[list.length - 1]) + 1000 : 0;
  };

  const applyOptimisticMove = (
    ticketId: Id<"tickets">,
    parentId: Id<"tickets"> | null,
    order: number
  ) => {
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      next.set(ticketId, { parentId, order });
      return next;
    });
  };

  const clearOptimisticMove = (ticketId: Id<"tickets">) => {
    setOptimisticMoves((prev) => {
      const next = new Map(prev);
      next.delete(ticketId);
      return next;
    });
  };

  const clearDragState = () => {
    pendingDragStateRef.current = null;
    setDragOverId(null);
    setDragOverPosition(null);
  };

  const resolveRowDropPosition = (
    event: React.DragEvent<HTMLDivElement>,
    depth: number
  ): Exclude<DragOverPosition, null> => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const offsetX = event.clientX - rect.left;
    const edgeBand = rect.height * 0.3;

    if (offsetY < edgeBand) return "above";
    if (offsetY > rect.height - edgeBand) return "below";

    // Require deliberate rightward placement to nest as a sub-issue.
    const nestTriggerX = Math.min(rect.width - 20, 150 + depth * 14);
    if (offsetX >= nestTriggerX) return "inside";

    return offsetY < rect.height / 2 ? "above" : "below";
  };

  const handleDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    targetTicket: TicketSummary,
    targetDepth: number
  ) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("application/x-ticket-id") as Id<"tickets">;
    if (!draggedId || draggedId === targetTicket._id) return;
    if (isDescendant(draggedId, targetTicket._id)) return;
    const dropPosition = resolveRowDropPosition(event, targetDepth);

    try {
      if (dropPosition === "inside") {
        const siblings = childrenByParent.get(targetTicket._id) ?? [];
        const lastTicket = siblings[siblings.length - 1];
        const draggedTicket = ticketsById.get(draggedId);
        const order = lastTicket
          ? getTicketOrderValue(lastTicket) + 1000
          : draggedTicket
            ? getTicketOrderValue(draggedTicket)
            : 0;
        applyOptimisticMove(draggedId, targetTicket._id, order);
        await updateTicket({ id: draggedId, parentId: targetTicket._id, order });
      } else if (dropPosition === "above" || dropPosition === "below") {
        const nextParentId = targetTicket.parentId ?? null;
        const siblings = childrenByParent.get(nextParentId ?? "root") ?? [];
        const order = calculateOrder(
          siblings,
          targetTicket._id,
          dropPosition,
          draggedId
        );
        if (order === null) return;
        applyOptimisticMove(draggedId, nextParentId, order);
        await updateTicket({ id: draggedId, parentId: nextParentId, order });
      }
    } catch (error) {
      clearOptimisticMove(draggedId);
      console.error(error);
    } finally {
      clearDragState();
      endTicketDrag();
    }
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this issue and its sub-issues?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLElement>,
    ticketId: Id<"tickets">
  ) => {
    if (event.dataTransfer.getData("application/x-ticket-id")) return;
    const dragRoot =
      (event.currentTarget.closest("[data-ticket-drag-root='true']") as HTMLElement | null) ??
      event.currentTarget;
    beginTicketDrag(event, dragRoot);
    event.dataTransfer.setData("application/x-ticket-id", ticketId);
    event.dataTransfer.setData("text/plain", ticketId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleRowClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.closest("a,button,select,textarea,input,[role='menuitem']")) return;
      startTransition(() => {
        router.push(`/workspace/${workspaceId}/tickets/${ticketId}?tab=list`);
      });
    },
    [router, workspaceId]
  );

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, ticketId: Id<"tickets">) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      startTransition(() => {
        router.push(`/workspace/${workspaceId}/tickets/${ticketId}?tab=list`);
      });
    },
    [router, workspaceId]
  );

  const prefetchTicketDetail = useCallback(
    (ticketId: Id<"tickets">) => {
      if (prefetchedTicketIdsRef.current.has(ticketId)) return;
      prefetchedTicketIdsRef.current.add(ticketId);
      router.prefetch(`/workspace/${workspaceId}/tickets/${ticketId}?tab=list`);
    },
    [router, workspaceId]
  );

  const handleStatusChange = (ticketId: Id<"tickets">, status: IssueStatus) => {
    setOptimisticStatuses((prev) => {
      const next = new Map(prev);
      next.set(ticketId, status);
      return next;
    });

    updateStatus({ id: ticketId, status }).catch((error) => {
      setOptimisticStatuses((prev) => {
        const next = new Map(prev);
        next.delete(ticketId);
        return next;
      });
      console.error(error);
    });
  };

  const handleArchiveToggle = (ticketId: Id<"tickets">, nextArchived: boolean) => {
    setOptimisticArchived((prev) => {
      const next = new Map(prev);
      next.set(ticketId, nextArchived);
      return next;
    });

    updateTicket({ id: ticketId, archived: nextArchived }).catch((error) => {
      setOptimisticArchived((prev) => {
        const next = new Map(prev);
        next.delete(ticketId);
        return next;
      });
      console.error(error);
    });
  };

  const lastSelectedIndexRef = useRef<number | null>(null);

  const toggleSelect = useCallback(
    (ticketId: Id<"tickets">, shiftKey = false) => {
      const currentIndex = displayRows.findIndex((r) => r.ticket._id === ticketId);
      if (shiftKey && lastSelectedIndexRef.current !== null && currentIndex !== -1) {
        const from = Math.min(lastSelectedIndexRef.current, currentIndex);
        const to = Math.max(lastSelectedIndexRef.current, currentIndex);
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) {
            next.add(displayRows[i].ticket._id);
          }
          return next;
        });
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(ticketId)) {
            next.delete(ticketId);
          } else {
            next.add(ticketId);
          }
          return next;
        });
      }
      if (currentIndex !== -1) lastSelectedIndexRef.current = currentIndex;
    },
    [displayRows]
  );

  const toggleSelectAll = useCallback(() => {
    if (selected.size === displayRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayRows.map((row) => row.ticket._id)));
    }
  }, [selected.size, displayRows]);

  const selectByStatus = useCallback(
    (status: IssueStatus) => {
      setSelected(
        new Set(
          displayRows
            .filter((r) => r.ticket.status === status)
            .map((r) => r.ticket._id)
        )
      );
    },
    [displayRows]
  );

  const selectByArchived = useCallback(
    (archived: boolean) => {
      setSelected(
        new Set(
          displayRows
            .filter((r) => (r.ticket.archived ?? false) === archived)
            .map((r) => r.ticket._id)
        )
      );
    },
    [displayRows]
  );

  const selectedHasArchived = useMemo(() => {
    if (selected.size === 0) return false;
    for (const row of displayRows) {
      if (selected.has(row.ticket._id) && (row.ticket.archived ?? false)) return true;
    }
    return false;
  }, [selected, displayRows]);

  const selectedHasUnarchived = useMemo(() => {
    if (selected.size === 0) return false;
    for (const row of displayRows) {
      if (selected.has(row.ticket._id) && !(row.ticket.archived ?? false)) return true;
    }
    return false;
  }, [selected, displayRows]);

  const handleBulkArchive = async (archive: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const previousSelection = new Set(selected);
    setBulkArchivePending(archive);
    setOptimisticArchived((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.set(id, archive);
      return next;
    });
    setSelected(new Set());
    try {
      await bulkArchive({ ids, archived: archive });
    } catch (error) {
      setOptimisticArchived((prev) => {
        const next = new Map(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setSelected(previousSelection);
      console.error(error);
    } finally {
      setBulkArchivePending(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} issue(s) and their sub-issues?`)) return;
    try {
      await bulkDelete({ ids });
      setSelected(new Set());
    } catch (error) {
      console.error(error);
    }
  };

  const handleResizeStart = useCallback(
    (col: "id" | "assignee" | "status" | "actions", e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = colWidthsRef.current[col];
      const mins: Record<string, number> = { id: 80, assignee: 80, status: 80, actions: 60 };

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        setColWidths((prev) => ({
          ...prev,
          [col]: Math.max(mins[col], startWidth + delta),
        }));
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    []
  );

  const shouldVirtualizeRows = displayRows.length > 200;

  const renderTicketRow = (ticket: TicketSummary, depth: number) => {
    const hasChildren = (ticket.childCount ?? 0) > 0;
    const isCollapsed = collapsed.has(ticket._id);
    const parentTicket = ticket.parentId
      ? ticketsById.get(ticket.parentId) ?? null
      : null;
    const dragClass =
      dragOverId === ticket._id
        ? dragOverPosition === "inside"
          ? "bg-accent"
          : dragOverPosition === "above"
            ? "shadow-[inset_0_2px_0_0_#ff3b00]"
            : "shadow-[inset_0_-2px_0_0_#ff3b00]"
        : "";

    return (
      <TicketTableRow
        ticket={ticket}
        workspaceId={workspaceId}
        workspacePrefix={workspacePrefix}
        workspaceTags={workspaceTags}
        gridTemplate={gridTemplate}
        parentTicket={parentTicket}
        depth={depth}
        hasChildren={hasChildren}
        isCollapsed={isCollapsed}
        isSelected={selected.has(ticket._id)}
        onToggleSelect={(shiftKey: boolean) => toggleSelect(ticket._id, shiftKey)}
        dragClass={dragClass}
        onToggleCollapse={() => toggleCollapsed(ticket._id)}
        onDragStart={(event) => handleDragStart(event, ticket._id)}
        onDragEnd={() => {
          clearDragState();
          endTicketDrag();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          const position = resolveRowDropPosition(event, depth);
          scheduleDragState(ticket._id, position);
        }}
        onDragLeave={() => scheduleDragState(null, null)}
        onDrop={(event) => handleDrop(event, ticket, depth)}
        onClick={(event) => handleRowClick(event, ticket._id)}
        onKeyDown={(event) => handleRowKeyDown(event, ticket._id)}
        onPrefetch={() => prefetchTicketDetail(ticket._id)}
        onStatusChange={(status) => handleStatusChange(ticket._id, status)}
        onArchiveToggle={() =>
          handleArchiveToggle(ticket._id, !(ticket.archived ?? false))
        }
        onDelete={() => handleDelete(ticket._id)}
      />
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b-2 border-primary bg-primary/10 px-7 py-2">
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-foreground">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <DispatchTicketsButton
              workspaceId={workspaceId}
              workspacePrefix={workspacePrefix}
              tickets={Array.from(selected)
                .map((ticketId) => ticketsById.get(ticketId))
                .filter((ticket): ticket is NonNullable<typeof ticket> => Boolean(ticket))
                .map((ticket) => ({
                  _id: ticket._id,
                  number: ticket.number ?? undefined,
                  title: ticket.title,
                }))}
              triggerLabel="Dispatch"
            />
            {selectedHasUnarchived && (
              <button
                type="button"
                onClick={() => handleBulkArchive(true)}
                disabled={bulkArchivePending !== null}
                className="inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground"
              >
                <Archive className="h-3 w-3" />
                {bulkArchivePending === true ? "Archiving..." : "Archive"}
              </button>
            )}
            {selectedHasArchived && (
              <button
                type="button"
                onClick={() => handleBulkArchive(false)}
                disabled={bulkArchivePending !== null}
                className="inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground"
              >
                <ArchiveRestore className="h-3 w-3" />
                {bulkArchivePending === false ? "Unarchiving..." : "Unarchive"}
              </button>
            )}
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 border border-destructive/50 bg-card px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-destructive transition hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2 md:px-7">
        <span className="kb-label mr-1">Filter</span>
        {ALL_FILTER_STATUSES.map((s) => {
          const active = statusFilter.has(s);
          const labels: Record<IssueStatus, string> = {
            backlog: "BACKLOG",
            unclaimed: "UNCLAIMED",
            dispatched: "DISPATCHED",
            in_progress: "IN PROGRESS",
            done: "DONE",
          };
          return (
            <button
              key={s}
              onClick={() => toggleStatusFilter(s)}
              className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                active
                  ? "border-foreground/20 bg-foreground/5 text-foreground"
                  : "border-transparent bg-transparent text-muted-foreground/50 hover:text-muted-foreground"
              }`}
            >
              {labels[s]}
            </button>
          );
        })}
        {toolbarAction ? <div className="ml-auto">{toolbarAction}</div> : null}
      </div>
      <div
        className="hidden border-b-2 border-border bg-card px-7 py-2 md:grid md:items-center"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* ID column with select-all checkbox + dropdown */}
        <div className="relative flex items-center gap-2 select-none">
          <div className="relative">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === displayRows.length}
              ref={(el) => {
                if (el) el.indeterminate = selected.size > 0 && selected.size < displayRows.length;
              }}
              onChange={toggleSelectAll}
              className="h-3.5 w-3.5 shrink-0 accent-primary"
            />
            <div className="group inline-block">
              <button
                type="button"
                className="ml-0.5 inline-flex text-muted-foreground/60 hover:text-foreground/80"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <div className="absolute left-0 top-full z-20 mt-1 hidden min-w-[140px] border border-border bg-card py-1 shadow-lg group-focus-within:block hover:block">
                {([
                  { label: "Select all", action: () => toggleSelectAll() },
                  { label: "Select none", action: () => setSelected(new Set()) },
                  { label: "Backlog", action: () => selectByStatus("backlog") },
                  { label: "Unclaimed", action: () => selectByStatus("unclaimed") },
                  { label: "Dispatched", action: () => selectByStatus("dispatched") },
                  { label: "In progress", action: () => selectByStatus("in_progress") },
                  { label: "Done", action: () => selectByStatus("done") },
                  { label: "Archived", action: () => selectByArchived(true) },
                  { label: "Unarchived", action: () => selectByArchived(false) },
                ] as const).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.action}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={() => cycleSort("number")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleSort("number"); }
            }}
            className={`inline-flex items-center gap-1 font-mono text-[9px] font-extrabold tracking-[0.2em] cursor-pointer text-muted-foreground/60 transition-colors hover:text-foreground/80 ${sort?.col === "number" ? "text-foreground/80" : ""}`}
          >
            ID
            {sort?.col === "number" && (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
          </span>
          <div
            className="absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize border-r border-border/50 transition-colors hover:border-primary/60 hover:bg-primary/20"
            onMouseDown={(e) => handleResizeStart("id", e)}
          />
        </div>
        {/* Remaining columns */}
        {([
          { label: "TITLE", sortCol: "title" as SortColumn, resizeKey: null },
          { label: "ASSIGNEE", sortCol: "assignee" as SortColumn, resizeKey: "assignee" as const },
          { label: "STATUS", sortCol: "status" as SortColumn, resizeKey: "status" as const },
          { label: "ACTIONS", sortCol: null, resizeKey: null },
        ]).map((col) => (
          <div key={col.label} className="relative select-none">
            <span
              role={col.sortCol ? "button" : undefined}
              tabIndex={col.sortCol ? 0 : undefined}
              onClick={col.sortCol ? () => cycleSort(col.sortCol!) : undefined}
              onKeyDown={
                col.sortCol
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        cycleSort(col.sortCol!);
                      }
                    }
                  : undefined
              }
              className={`inline-flex items-center gap-1 font-mono text-[9px] font-extrabold tracking-[0.2em] ${
                col.label === "ACTIONS"
                  ? "block w-full justify-end text-right text-muted-foreground/60"
                  : col.sortCol
                    ? "cursor-pointer text-muted-foreground/60 transition-colors hover:text-foreground/80"
                    : "text-muted-foreground/60"
              } ${sort?.col === col.sortCol ? "text-foreground/80" : ""}`}
            >
              {col.label}
              {sort?.col === col.sortCol &&
                (sort.dir === "asc" ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                ))}
            </span>
            {col.resizeKey && (
              <div
                className="absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize border-r border-border/50 transition-colors hover:border-primary/60 hover:bg-primary/20"
                onMouseDown={(e) => handleResizeStart(col.resizeKey!, e)}
              />
            )}
          </div>
        ))}
      </div>

      <div ref={listRef} className="kb-scroll min-h-0 flex-1 overflow-auto">
        {displayRows.length === 0 && (
          <div className="px-7 py-10 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            No issues yet.
          </div>
        )}

        {displayRows.length > 0 &&
          (shouldVirtualizeRows ? (
            <div
              className="relative divide-y divide-border/50"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const { ticket, depth } = displayRows[virtualRow.index];
                return (
                  <div
                    key={ticket._id}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {renderTicketRow(ticket, depth)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {displayRows.map(({ ticket, depth }) => (
                <div key={ticket._id}>{renderTicketRow(ticket, depth)}</div>
              ))}
            </div>
          ))}
      </div>

    </div>
  );
}
