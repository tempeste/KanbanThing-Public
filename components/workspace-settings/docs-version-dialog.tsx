"use client";

import { Doc } from "@/convex/_generated/dataModel";
import { Markdown } from "@/components/markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type WorkspaceDocsVersionDialogProps = {
  open: boolean;
  selectedVersion: Doc<"workspaceDocsVersions"> | null;
  onOpenChange: (open: boolean) => void;
};

export function WorkspaceDocsVersionDialog({
  open,
  selectedVersion,
  onOpenChange,
}: WorkspaceDocsVersionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Docs Version</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border bg-background/60 p-4">
          {selectedVersion ? (
            selectedVersion.docs.trim() ? (
              <Markdown content={selectedVersion.docs} className="prose-lg" />
            ) : (
              <p className="text-sm text-muted-foreground">No content.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">No version selected.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
