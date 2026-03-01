"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type TicketStatus = "backlog" | "unclaimed" | "dispatched" | "in_progress" | "done";

type DispatchTicket = {
  _id: Id<"tickets">;
  title: string;
  number?: number;
  status: TicketStatus;
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: "Backlog",
  unclaimed: "Unclaimed",
  dispatched: "Dispatched",
  in_progress: "In Progress",
  done: "Done",
};

const STATUS_COLOR: Record<TicketStatus, string> = {
  backlog: "border-[var(--backlog)]/40 text-[var(--backlog)]",
  unclaimed: "border-[var(--unclaimed)]/40 text-[var(--unclaimed)]",
  dispatched: "border-[var(--dispatched)]/40 text-[var(--dispatched)]",
  in_progress: "border-[var(--in-progress)]/40 text-[var(--in-progress)]",
  done: "border-[var(--done)]/40 text-[var(--done)]",
};

const STATUS_CSS_VAR: Record<TicketStatus, string> = {
  backlog: "var(--backlog)",
  unclaimed: "var(--unclaimed)",
  dispatched: "var(--dispatched)",
  in_progress: "var(--in-progress)",
  done: "var(--done)",
};

interface DispatchTicketsButtonProps {
  workspaceId: Id<"workspaces">;
  workspacePrefix: string;
  tickets: DispatchTicket[];
  triggerLabel?: string;
  triggerClassName?: string;
  onDispatched?: () => void;
}

export function DispatchTicketsButton({
  workspaceId,
  workspacePrefix,
  tickets,
  triggerLabel = "Dispatch",
  triggerClassName,
  onDispatched,
}: DispatchTicketsButtonProps) {
  const { isAuthenticated } = useConvexAuth();
  const [open, setOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<Id<"openclawInstances"> | "">("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"tickets">>>(new Set());

  const openClawInstances = (useQuery(
    api.openclawInstances.list,
    isAuthenticated ? {} : "skip"
  ) ?? []) as Array<{
    _id: string;
    name: string;
    integrationMode?: "basic" | "enhanced";
    tokenSyncStatus?: "unknown" | "token_rotation_pending" | "healthy" | "auth_failed";
  }>;
  const dispatchTickets = useMutation(api.openclawDispatch.dispatchTickets);
  const selectedInstance = openClawInstances.find((instance) => instance._id === selectedInstanceId);
  const selectedInstanceMode = selectedInstance?.integrationMode ?? "basic";
  const selectedInstanceRequiresPluginVerify = selectedInstanceMode === "enhanced";
  const selectedInstanceIsVerified = selectedInstance?.tokenSyncStatus === "healthy";
  const selectedInstanceCanDispatch =
    !!selectedInstance && (!selectedInstanceRequiresPluginVerify || selectedInstanceIsVerified);

  // Group tickets by status for quick-filter buttons
  const statusGroups = useMemo(() => {
    const groups: Partial<Record<TicketStatus, DispatchTicket[]>> = {};
    for (const ticket of tickets) {
      (groups[ticket.status] ??= []).push(ticket);
    }
    return groups;
  }, [tickets]);

  const availableStatuses = useMemo(
    () => (Object.keys(statusGroups) as TicketStatus[]).sort(
      (a, b) => ["backlog", "unclaimed", "dispatched", "in_progress", "done"].indexOf(a) -
                ["backlog", "unclaimed", "dispatched", "in_progress", "done"].indexOf(b)
    ),
    [statusGroups]
  );

  // Initialize selection when dialog opens — default to unclaimed + backlog
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        const defaultSelected = new Set<Id<"tickets">>();
        for (const ticket of tickets) {
          if (ticket.status === "unclaimed" || ticket.status === "backlog") {
            defaultSelected.add(ticket._id);
          }
        }
        setSelectedIds(defaultSelected);
        setError(null);
      }
      setOpen(nextOpen);
    },
    [tickets]
  );

  const toggleTicket = useCallback((id: Id<"tickets">) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(tickets.map((t) => t._id)));
  }, [tickets]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectByStatus = useCallback(
    (status: TicketStatus) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const group = statusGroups[status] ?? [];
        const allSelected = group.every((t) => next.has(t._id));
        for (const t of group) {
          if (allSelected) next.delete(t._id);
          else next.add(t._id);
        }
        return next;
      });
    },
    [statusGroups]
  );

  const isStatusFullySelected = useCallback(
    (status: TicketStatus) => {
      const group = statusGroups[status] ?? [];
      return group.length > 0 && group.every((t) => selectedIds.has(t._id));
    },
    [statusGroups, selectedIds]
  );

  const handleDispatch = async () => {
    if (!selectedInstanceId || selectedIds.size === 0) return;
    if (!selectedInstanceCanDispatch) {
      setError(
        "Enhanced OpenClaw integration requires the KanbanThing plugin and a successful plugin verification in Account Settings before dispatching."
      );
      return;
    }
    setError(null);
    setIsDispatching(true);
    try {
      await dispatchTickets({
        workspaceId,
        instanceId: selectedInstanceId,
        ticketIds: Array.from(selectedIds),
        callbackBaseUrl:
          typeof window !== "undefined" ? window.location.origin : undefined,
      });
      setOpen(false);
      setSelectedInstanceId("");
      setSelectedIds(new Set());
      onDispatched?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setIsDispatching(false);
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dispatch Tickets</DialogTitle>
          <DialogDescription>
            Select tickets and an OpenClaw instance to dispatch.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded border border-destructive/45 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {openClawInstances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No instances configured. Add one in{" "}
            <Link href={`/account?returnTo=/workspace/${workspaceId}`} className="underline">
              account settings
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              OpenClaw Instance
            </label>
            <select
              value={selectedInstanceId}
              onChange={(event) =>
                setSelectedInstanceId(event.target.value as Id<"openclawInstances"> | "")
              }
              className="h-9 w-full border border-border bg-background px-3 text-sm"
            >
              <option value="">Select instance...</option>
              {openClawInstances.map((instance) => (
                <option key={instance._id} value={instance._id}>
                  {instance.name}
                  {instance.integrationMode === "enhanced"
                    ? instance.tokenSyncStatus === "healthy"
                      ? " (enhanced, verified)"
                      : " (enhanced, plugin verify required)"
                    : " (basic)"}
                </option>
              ))}
            </select>
            {selectedInstance && selectedInstanceRequiresPluginVerify && !selectedInstanceIsVerified ? (
              <p className="text-xs text-amber-300">
                Enhanced mode requires the KanbanThing OpenClaw plugin. Go to{" "}
                <Link href={`/account?returnTo=/workspace/${workspaceId}`} className="underline">
                  account settings
                </Link>{" "}
                and click Verify Plugin for the instance.
              </p>
            ) : null}
            {selectedInstance && !selectedInstanceRequiresPluginVerify ? (
              <p className="text-xs text-muted-foreground">
                Basic mode uses the original webhook dispatch path. Plugin verification is optional.
              </p>
            ) : null}
          </div>
        )}

        {/* Ticket selection toolbar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Tickets
              <span className="ml-2 tabular-nums text-foreground/70">
                {selectedCount}/{tickets.length}
              </span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                All
              </button>
              <span className="text-[8px] text-border">|</span>
              <button
                type="button"
                onClick={selectNone}
                className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                None
              </button>
            </div>
          </div>

          {/* Status quick-filter chips */}
          {availableStatuses.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {availableStatuses.map((status) => {
                const count = statusGroups[status]?.length ?? 0;
                const active = isStatusFullySelected(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => selectByStatus(status)}
                    className={`flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] transition-colors ${
                      active
                        ? STATUS_COLOR[status] + " border-current/30 bg-current/[0.08]"
                        : "border-border text-muted-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    {STATUS_LABEL[status]}
                    <span className="tabular-nums opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Ticket list with checkboxes */}
          <div className="max-h-56 space-y-0.5 overflow-auto rounded border border-border p-1">
            {tickets.map((ticket) => {
              const checked = selectedIds.has(ticket._id);
              return (
                <button
                  key={ticket._id}
                  type="button"
                  onClick={() => toggleTicket(ticket._id)}
                  className={`group flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors ${
                    checked
                      ? ""
                      : "hover:bg-muted/50"
                  }`}
                  style={checked ? { backgroundColor: `color-mix(in oklch, ${STATUS_CSS_VAR[ticket.status]} 8%, transparent)` } : undefined}
                >
                  {/* Custom checkbox */}
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors ${
                      checked
                        ? ""
                        : "border-muted-foreground/30 group-hover:border-muted-foreground/60"
                    }`}
                    style={checked ? { borderColor: STATUS_CSS_VAR[ticket.status], backgroundColor: STATUS_CSS_VAR[ticket.status], color: "white" } : undefined}
                  >
                    {checked && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.2 5.7L6.5 2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    )}
                  </span>

                  {/* Ticket number */}
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {workspacePrefix}-{ticket.number ?? "---"}
                  </span>

                  {/* Title */}
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {ticket.title}
                  </span>

                  {/* Status pill */}
                  <span
                    className={`shrink-0 rounded border px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.08em] ${STATUS_COLOR[ticket.status]}`}
                  >
                    {STATUS_LABEL[ticket.status]}
                  </span>
                </button>
              );
            })}
            {tickets.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No dispatchable tickets.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/60">
            {selectedCount === 0
              ? "No tickets selected"
              : selectedCount === 1
                ? "1 ticket selected"
                : `${selectedCount} tickets selected`}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDispatch}
              disabled={
                isDispatching ||
                !selectedInstanceId ||
                !selectedInstanceCanDispatch ||
                selectedCount === 0 ||
                openClawInstances.length === 0
              }
            >
              {isDispatching
                ? "Dispatching..."
                : selectedCount === 0
                  ? "Execute"
                  : `Execute (${selectedCount})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
