"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  MoreVertical,
  Trash2,
  Archive,
  ArchiveRestore,
  Circle,
  Clock,
  CheckCircle2,
  ArrowUpDown,
  Search,
  Bot,
  User,
} from "lucide-react";
import { TicketModal } from "@/components/ticket-modal";
import { formatDocNumber, formatTicketNumber } from "@/lib/utils";

type Ticket = Doc<"tickets">;
type FeatureDoc = Doc<"featureDocs">;
type Status = "unclaimed" | "in_progress" | "done";

const STATUS_CONFIG: Record<Status, { label: string; icon: React.ReactNode; colorClass: string }> = {
  unclaimed: {
    label: "Unclaimed",
    icon: <Circle className="w-3 h-3" />,
    colorClass: "bg-unclaimed/20 text-unclaimed",
  },
  in_progress: {
    label: "In Progress",
    icon: <Clock className="w-3 h-3" />,
    colorClass: "bg-in-progress/20 text-in-progress",
  },
  done: {
    label: "Done",
    icon: <CheckCircle2 className="w-3 h-3" />,
    colorClass: "bg-done/20 text-done",
  },
};

const columnHelper = createColumnHelper<Ticket>();

interface TicketTableProps {
  workspaceId: Id<"workspaces">;
  tickets: Ticket[];
  featureDocs: FeatureDoc[];
  workspacePrefix: string;
}

export function TicketTable({
  workspaceId,
  tickets,
  featureDocs,
  workspacePrefix,
}: TicketTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const updateStatus = useMutation(api.tickets.updateStatus);
  const deleteTicket = useMutation(api.tickets.remove);
  const updateTicket = useMutation(api.tickets.update);
  const docsById = useMemo(
    () => new Map(featureDocs.map((doc) => [doc._id, doc])),
    [featureDocs]
  );
  const ticketsById = useMemo(
    () => new Map(tickets.map((ticket) => [ticket._id, ticket])),
    [tickets]
  );
  const isArchived = (ticket: Ticket) => ticket.archived ?? false;

  const filteredTickets = useMemo(() => {
    if (showArchived) return tickets;
    return tickets.filter((ticket) => !isArchived(ticket));
  }, [tickets, showArchived]);

  const handleStatusChange = async (ticketId: Id<"tickets">, newStatus: Status) => {
    await updateStatus({ id: ticketId, status: newStatus });
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this ticket?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const columns = [
    columnHelper.accessor("number", {
      header: "ID",
      cell: (info) => {
        const formatted = formatTicketNumber(workspacePrefix, info.getValue());
        return (
          <span className="text-xs font-mono text-muted-foreground">
            {formatted ?? "-"}
          </span>
        );
      },
    }),
    columnHelper.accessor("title", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: (info) => (
        <div className="space-y-1">
          <button
            onClick={() => setEditingTicket(info.row.original)}
            className="font-medium hover:text-primary transition-colors text-left"
          >
            {info.getValue()}
          </button>
          {info.row.original.parentTicketId && ticketsById.get(info.row.original.parentTicketId) && (
            <div className="text-xs text-muted-foreground">
              Sub-ticket of{" "}
              {formatTicketNumber(
                workspacePrefix,
                ticketsById.get(info.row.original.parentTicketId)?.number
              ) ?? "ticket"}{" "}
              · {ticketsById.get(info.row.original.parentTicketId)?.title}
            </div>
          )}
          {isArchived(info.row.original) && (
            <Badge variant="outline" className="text-[10px]">
              Archived
            </Badge>
          )}
        </div>
      ),
    }),
    columnHelper.accessor("description", {
      header: "Description",
      cell: (info) => (
        <span className="text-muted-foreground text-sm line-clamp-1 max-w-[300px]">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("docId", {
      header: "Doc",
      cell: (info) => {
        const docId = info.getValue();
        const doc = docId ? docsById.get(docId) : null;
        if (!doc) {
          return <span className="text-muted-foreground text-sm">-</span>;
        }
        const docNumber = formatDocNumber(workspacePrefix, doc.number);
        return (
          <button
            type="button"
            onClick={() => router.push(`${pathname}?tab=feature-docs&doc=${doc._id}`)}
            className="text-left text-sm max-w-[220px] truncate inline-block hover:text-primary"
          >
            {docNumber ? `${docNumber} · ${doc.title}` : doc.title}
          </button>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: (info) => {
        const status = info.getValue() as Status;
        const config = STATUS_CONFIG[status];
        return (
          <Badge variant="outline" className={`gap-1 ${config.colorClass}`}>
            {config.icon}
            {config.label}
          </Badge>
        );
      },
      filterFn: "equals",
    }),
    columnHelper.accessor("ownerId", {
      header: "Owner",
      cell: (info) => {
        const ownerId = info.getValue();
        const ownerType = info.row.original.ownerType;
        if (!ownerId) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex items-center gap-1 text-sm">
            {ownerType === "agent" ? (
              <Bot className="w-3 h-3 text-muted-foreground" />
            ) : (
              <User className="w-3 h-3 text-muted-foreground" />
            )}
            <span>{ownerId}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("updatedAt", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Updated
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: (info) => (
        <span className="text-sm text-muted-foreground">
          {new Date(info.getValue()).toLocaleDateString()}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      cell: (info) => {
        const ticket = info.row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ticket.status !== "unclaimed" && (
                <DropdownMenuItem onClick={() => handleStatusChange(ticket._id, "unclaimed")}>
                  <Circle className="w-4 h-4 mr-2" />
                  Move to Unclaimed
                </DropdownMenuItem>
              )}
              {ticket.status !== "in_progress" && (
                <DropdownMenuItem onClick={() => handleStatusChange(ticket._id, "in_progress")}>
                  <Clock className="w-4 h-4 mr-2" />
                  Move to In Progress
                </DropdownMenuItem>
              )}
              {ticket.status !== "done" && (
                <DropdownMenuItem onClick={() => handleStatusChange(ticket._id, "done")}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Move to Done
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to Feature Doc</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => updateTicket({ id: ticket._id, docId: null })}
                  >
                    Ungrouped
                  </DropdownMenuItem>
                  {featureDocs.map((doc) => (
                    <DropdownMenuItem
                      key={doc._id}
                      disabled={doc.archived && doc._id !== ticket.docId}
                      onClick={() => updateTicket({ id: ticket._id, docId: doc._id })}
                    >
                      {formatDocNumber(workspacePrefix, doc.number) ?? "DOC"} · {doc.title}
                      {doc.archived ? " (archived)" : ""}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onClick={() => updateTicket({ id: ticket._id, archived: !isArchived(ticket) })}
              >
                {isArchived(ticket) ? (
                  <ArchiveRestore className="w-4 h-4 mr-2" />
                ) : (
                  <Archive className="w-4 h-4 mr-2" />
                )}
                {isArchived(ticket) ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(ticket._id)}
                className="text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: filteredTickets,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "unclaimed", "in_progress", "done"] as const).map((status) => (
              <Button
                key={status}
                variant={
                  (status === "all" && !columnFilters.find((f) => f.id === "status")) ||
                  columnFilters.find((f) => f.id === "status" && f.value === status)
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() => {
                  if (status === "all") {
                    setColumnFilters((prev) => prev.filter((f) => f.id !== "status"));
                  } else {
                    setColumnFilters((prev) => [
                      ...prev.filter((f) => f.id !== "status"),
                      { id: "status", value: status },
                    ]);
                  }
                }}
              >
                {status === "all" ? "All" : STATUS_CONFIG[status].label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived((prev) => !prev)}
          >
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Ticket
          </Button>
        </div>
      </div>

      <div className="border rounded-lg">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left text-sm font-medium">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">
                  No tickets found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TicketModal
        workspaceId={workspaceId}
        featureDocs={featureDocs}
        tickets={tickets}
        workspacePrefix={workspacePrefix}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {editingTicket && (
        <TicketModal
          workspaceId={workspaceId}
          featureDocs={featureDocs}
          tickets={tickets}
          workspacePrefix={workspacePrefix}
          ticket={editingTicket}
          open={true}
          onOpenChange={(open) => !open && setEditingTicket(null)}
        />
      )}
    </>
  );
}
