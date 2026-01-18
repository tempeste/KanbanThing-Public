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
import { useState } from "react";
import {
  Plus,
  MoreVertical,
  Trash2,
  Circle,
  Clock,
  CheckCircle2,
  ArrowUpDown,
  Search,
  Bot,
  User,
} from "lucide-react";
import { TicketModal } from "@/components/ticket-modal";

type Ticket = Doc<"tickets">;
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
}

export function TicketTable({ workspaceId, tickets }: TicketTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);

  const updateStatus = useMutation(api.tickets.updateStatus);
  const deleteTicket = useMutation(api.tickets.remove);

  const handleStatusChange = async (ticketId: Id<"tickets">, newStatus: Status) => {
    await updateStatus({ id: ticketId, status: newStatus });
  };

  const handleDelete = async (ticketId: Id<"tickets">) => {
    if (confirm("Delete this ticket?")) {
      await deleteTicket({ id: ticketId });
    }
  };

  const columns = [
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
        <button
          onClick={() => setEditingTicket(info.row.original)}
          className="font-medium hover:text-primary transition-colors text-left"
        >
          {info.getValue()}
        </button>
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
    data: tickets,
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
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
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
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {editingTicket && (
        <TicketModal
          workspaceId={workspaceId}
          ticket={editingTicket}
          open={true}
          onOpenChange={(open) => !open && setEditingTicket(null)}
        />
      )}
    </>
  );
}
