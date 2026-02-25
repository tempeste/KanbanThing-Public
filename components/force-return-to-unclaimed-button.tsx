"use client";

import { useState } from "react";
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

interface ForceReturnToUnclaimedButtonProps {
  disabled?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function ForceReturnToUnclaimedButton({
  disabled = false,
  onConfirm,
}: ForceReturnToUnclaimedButtonProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to return ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          Force Return to Unclaimed
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Force Return to Unclaimed</DialogTitle>
          <DialogDescription>
            Use this only if you cannot confirm cancellation. This may cause duplicate work if the
            OpenClaw agent already received or started the dispatch.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded border border-destructive/45 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Recommended order: `Cancel Dispatch` first, wait for `Cancel Ack` / result, then return
          to unclaimed if needed.
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Keep Dispatched
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Returning..." : "Force Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
