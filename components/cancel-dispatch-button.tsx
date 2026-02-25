"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CancelDispatchButtonProps {
  workspaceId: Id<"workspaces">;
  instanceId: Id<"openclawInstances">;
  ticketId: Id<"tickets">;
  dispatchId?: string | null;
  runId?: string | null;
  disabled?: boolean;
  onCancelled?: () => void;
}

export function CancelDispatchButton({
  workspaceId,
  instanceId,
  ticketId,
  dispatchId,
  runId,
  disabled = false,
  onCancelled,
}: CancelDispatchButtonProps) {
  const requestCancelDispatch = useAction(api.openclawDispatchActions.requestCancelDispatch);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await requestCancelDispatch({
        workspaceId,
        instanceId,
        ticketIds: [ticketId],
        ...(dispatchId ? { dispatchId } : {}),
        ...(runId ? { runId } : {}),
      });
      setOpen(false);
      onCancelled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request cancellation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          Cancel Dispatch
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Dispatch</DialogTitle>
          <DialogDescription>
            This sends a cancellation request to the OpenClaw plugin and marks the dispatch as
            cancel requested. Do this before moving the ticket back to unclaimed to reduce duplicate
            work.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded border border-destructive/45 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Requesting..." : "Request Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
