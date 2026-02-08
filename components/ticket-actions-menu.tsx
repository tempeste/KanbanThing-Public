"use client";

import { Archive, ArchiveRestore, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IssueStatus, STATUS_META } from "@/components/issue-status";

interface TicketActionsMenuProps {
  isArchived: boolean;
  onStatusChange: (status: IssueStatus) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function TicketActionsMenu({
  isArchived,
  onStatusChange,
  onArchiveToggle,
  onDelete,
}: TicketActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-none border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-none border-border bg-card text-foreground/90">
        {Object.entries(STATUS_META).map(([status, config]) => (
          <DropdownMenuItem
            key={status}
            onClick={() => onStatusChange(status as IssueStatus)}
          >
            Move to {config.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onArchiveToggle}>
          {isArchived ? (
            <>
              <ArchiveRestore className="w-4 h-4 mr-2" />
              Unarchive
            </>
          ) : (
            <>
              <Archive className="w-4 h-4 mr-2" />
              Archive
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
