"use client";

import Link from "next/link";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { formatTicketNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

type TicketDetailHeaderProps = {
  workspaceId: Id<"workspaces">;
  workspaceName: string;
  backHref: string;
  ancestors: Doc<"tickets">[];
  workspacePrefix: string;
  ticketNumber: string | null | undefined;
  isEditing: boolean;
  ticketArchived: boolean;
  onToggleEdit: () => void;
  onToggleArchive: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export function TicketDetailHeader({
  workspaceId,
  workspaceName,
  backHref,
  ancestors,
  workspacePrefix,
  ticketNumber,
  isEditing,
  ticketArchived,
  onToggleEdit,
  onToggleArchive,
  onDelete,
}: TicketDetailHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/60 bg-card/50">
      <div className="flex items-center justify-between py-2.5 pl-12 pr-4 md:px-6">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href={backHref}
            className="-ml-1.5 shrink-0 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <nav className="flex min-w-0 items-center gap-1 overflow-hidden text-sm text-muted-foreground">
            <Link
              href={`/workspace/${workspaceId}`}
              className="shrink-0 transition-colors hover:text-foreground"
            >
              {workspaceName}
            </Link>
            {ancestors.map((ancestor) => (
              <span key={ancestor._id} className="flex shrink-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <Link
                  href={`/workspace/${workspaceId}/tickets/${ancestor._id}`}
                  className="font-mono text-xs transition-colors hover:text-foreground"
                >
                  {formatTicketNumber(workspacePrefix, ancestor.number) ?? "—"}
                </Link>
              </span>
            ))}
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="truncate font-mono text-xs text-foreground/70">{ticketNumber}</span>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onToggleEdit}
          >
            {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {isEditing ? "Cancel" : "Edit"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 border-border/80 bg-card/95">
              <DropdownMenuItem onClick={onToggleArchive}>
                {ticketArchived ? (
                  <>
                    <ArchiveRestore className="mr-2 h-4 w-4" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Issue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mx-1 h-5 w-px bg-border/50" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
