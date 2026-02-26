"use client";

import Link from "next/link";
import { useState } from "react";
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

type DispatchTicket = {
  _id: Id<"tickets">;
  title: string;
  number?: number;
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

  const handleDispatch = async () => {
    if (!selectedInstanceId || tickets.length === 0) return;
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
        ticketIds: tickets.map((ticket) => ticket._id),
      });
      setOpen(false);
      setSelectedInstanceId("");
      onDispatched?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispatch Tickets</DialogTitle>
          <DialogDescription>
            Send selected tickets to an OpenClaw instance.
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

        <div className="max-h-52 space-y-2 overflow-auto rounded border border-border p-2">
          {tickets.map((ticket) => (
            <div key={ticket._id} className="rounded border border-border/60 p-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {workspacePrefix}-{ticket.number ?? "---"}
              </span>{" "}
              {ticket.title}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
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
              tickets.length === 0 ||
              openClawInstances.length === 0
            }
          >
            {isDispatching ? "Dispatching..." : "Execute"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
