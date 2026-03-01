"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/kanban-board";
import { TicketTable } from "@/components/ticket-table";
import { generateWorkspacePrefix } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { useSession } from "@/lib/auth-client";
import { useWorkspaceData } from "@/components/workspace-data-provider";
import { deriveVisibleTickets, type BoardSortOption } from "@/lib/ticket-derivations";
import { DispatchTicketsButton } from "@/components/dispatch-tickets-button";
import { IssueStatus } from "@/components/issue-status";
import { Search, X, Download } from "lucide-react";

const STATUS_ACCENTS = {
  backlog: "var(--backlog)",
  unclaimed: "var(--unclaimed)",
  dispatched: "var(--dispatched)",
  in_progress: "var(--in-progress)",
  done: "var(--done)",
} as const;

const ALL_STATUS_FILTERS: IssueStatus[] = [
  "backlog",
  "unclaimed",
  "dispatched",
  "in_progress",
  "done",
];

const DEFAULT_BOARD_STATUS_FILTER: IssueStatus[] = [
  "unclaimed",
  "dispatched",
  "in_progress",
  "done",
];

const STATUS_FILTER_STORAGE_KEY_PREFIX = "kanbanthing:workspace-status-filter:";
const BOARD_SORT_STORAGE_KEY_PREFIX = "kanbanthing:workspace-board-sort:";

function deserializeBoardSort(raw: string | null): BoardSortOption {
  if (
    raw === "order" ||
    raw === "newest" ||
    raw === "oldest" ||
    raw === "title" ||
    raw === "priority"
  ) {
    return raw;
  }
  return "order";
}

function deserializeStatusFilter(
  raw: string | null,
  fallback: Set<IssueStatus>
): Set<IssueStatus> {
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is IssueStatus =>
      (ALL_STATUS_FILTERS as string[]).includes(value)
    );

  if (parsed.length === 0) return fallback;
  return new Set(parsed);
}

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = params.id as Id<"workspaces">;
  const { data: session, isPending: isSessionPending } = useSession();
  const { workspace, ticketSummaries: tickets } = useWorkspaceData();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "list" || tabParam === "board" ? tabParam : "board";
  const showArchived = searchParams.get("archived") === "1";
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [boardSort, setBoardSort] = useState<BoardSortOption>("order");
  const boardSortStorageKey = `${BOARD_SORT_STORAGE_KEY_PREFIX}${workspaceId}`;
  const [boardSortRestoredKey, setBoardSortRestoredKey] = useState<string | null>(null);
  const statusFilterStorageKey = `${STATUS_FILTER_STORAGE_KEY_PREFIX}${workspaceId}`;
  const defaultStatusFilter = useMemo(
    () =>
      new Set<IssueStatus>(
        activeTab === "board" ? DEFAULT_BOARD_STATUS_FILTER : ALL_STATUS_FILTERS
      ),
    [activeTab]
  );
  const [statusFilter, setStatusFilter] = useState<Set<IssueStatus>>(defaultStatusFilter);
  const [statusFilterRestoredKey, setStatusFilterRestoredKey] = useState<string | null>(null);

  useEffect(() => {
    setBoardSortRestoredKey(null);
    setBoardSort(deserializeBoardSort(window.localStorage.getItem(boardSortStorageKey)));
    setBoardSortRestoredKey(boardSortStorageKey);
  }, [boardSortStorageKey]);

  useEffect(() => {
    if (boardSortRestoredKey !== boardSortStorageKey) return;
    window.localStorage.setItem(boardSortStorageKey, boardSort);
  }, [boardSort, boardSortRestoredKey, boardSortStorageKey]);

  useEffect(() => {
    setStatusFilterRestoredKey(null);
    const next = deserializeStatusFilter(
      window.localStorage.getItem(statusFilterStorageKey),
      defaultStatusFilter
    );
    setStatusFilter(next);
    setStatusFilterRestoredKey(statusFilterStorageKey);
  }, [defaultStatusFilter, statusFilterStorageKey]);

  useEffect(() => {
    if (statusFilterRestoredKey !== statusFilterStorageKey) return;
    const serialized = ALL_STATUS_FILTERS.filter((status) => statusFilter.has(status)).join(",");
    window.localStorage.setItem(statusFilterStorageKey, serialized);
  }, [statusFilter, statusFilterRestoredKey, statusFilterStorageKey]);

  const allVisibleTickets = useMemo(
    () => (tickets ? deriveVisibleTickets(tickets, showArchived) : []),
    [tickets, showArchived]
  );
  const visibleTickets = useMemo(() => {
    if (!deferredSearchQuery.trim()) return allVisibleTickets;
    const q = deferredSearchQuery.trim().toLowerCase();
    return allVisibleTickets.filter(
      (ticket) =>
        ticket.title.toLowerCase().includes(q) ||
        (ticket.number != null && String(ticket.number).includes(q)) ||
        (ticket.ownerDisplayName?.toLowerCase().includes(q))
    );
  }, [allVisibleTickets, deferredSearchQuery]);

  if (isSessionPending) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="kb-label">Loading workspace...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-6">
        <div className="kb-panel kb-anim w-full max-w-xl p-8">
          <div className="mb-3 kb-label">Access Required</div>
          <h1 className="kb-title mb-2">
            KANBAN<span className="text-primary">THING</span>
          </h1>
          <p className="mb-8 text-sm text-muted-foreground">
            Sign in to access this workspace.
          </p>
          <Link href="/login" className="block">
            <Button className="w-full" size="lg">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (workspace === undefined || tickets === undefined) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b-2 border-b-border bg-card pl-12 pr-4 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-8 w-52 animate-pulse bg-muted" />
            <div className="hidden h-3 w-16 animate-pulse bg-muted md:block" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-7 w-16 animate-pulse border border-border bg-card" />
            <div className="h-7 w-16 animate-pulse border border-border bg-card" />
            <div className="ml-2 h-8 w-8 animate-pulse rounded-full bg-muted" />
          </div>
        </header>

        <div className="flex h-10 items-center gap-8 border-b border-b-muted bg-background px-4 md:px-7">
          <div className="h-3 w-24 animate-pulse bg-muted" />
          <div className="h-3 w-24 animate-pulse bg-muted" />
          <div className="h-3 w-24 animate-pulse bg-muted" />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden border-t-2 border-t-primary">
          <div className="grid h-full md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, columnIndex) => (
              <section
                key={columnIndex}
                className={`flex min-h-0 flex-col border-border ${columnIndex < 2 ? "border-r" : ""}`}
              >
                <div className="border-b border-border px-4 pb-3 pt-4 md:px-5">
                  <div className="h-6 w-36 animate-pulse bg-muted" />
                </div>
                <div className="space-y-2.5 p-3">
                  {Array.from({ length: 3 }).map((_, cardIndex) => (
                    <div key={cardIndex} className="border border-border bg-card p-4">
                      <div className="h-3 w-24 animate-pulse bg-muted" />
                      <div className="mt-3 h-4 w-full animate-pulse bg-muted" />
                      <div className="mt-2 h-4 w-4/5 animate-pulse bg-muted" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <footer className="flex h-7 items-center justify-between border-t border-border bg-card px-4 md:px-7">
          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground/60">Loading workspace state...</span>
          <span className="font-mono text-[8px] text-muted-foreground/50">...</span>
        </footer>
      </div>
    );
  }

  if (workspace === null) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-center">
        <div>
          <h1 className="mb-4 text-2xl font-bold">Workspace not found</h1>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const workspacePrefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);
  const backlogCount = visibleTickets.filter((ticket) => ticket.status === "backlog").length;
  const doneCount = visibleTickets.filter((ticket) => ticket.status === "done").length;
  const inProgressCount = visibleTickets.filter(
    (ticket) => ticket.status === "in_progress"
  ).length;
  const dispatchedCount = visibleTickets.filter(
    (ticket) => ticket.status === "dispatched"
  ).length;
  const unclaimedCount = visibleTickets.filter(
    (ticket) => ticket.status === "unclaimed"
  ).length;
  const completionPct =
    visibleTickets.length === 0 ? 0 : Math.round((doneCount / visibleTickets.length) * 100);
  const completionDoneWidth =
    visibleTickets.length === 0
      ? 0
      : Math.round((doneCount / visibleTickets.length) * 100);
  const completionInProgressWidth =
    visibleTickets.length === 0
      ? 0
      : Math.round((inProgressCount / visibleTickets.length) * 100);
  const dispatchableTickets = visibleTickets.filter((ticket) => ticket.status !== "done");

  const exportTickets = (format: "json" | "csv") => {
    if (!tickets) return;
    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === "json") {
      const data = tickets.map((t) => ({
        id: t._id,
        title: t.title,
        number: t.number ?? null,
        status: t.status,
        priority: t.priority ?? "none",
        ownerId: t.ownerId ?? null,
        ownerType: t.ownerType ?? null,
        ownerDisplayName: t.ownerDisplayName ?? null,
        parentId: t.parentId ?? null,
        order: t.order,
        archived: t.archived ?? false,
        childCount: t.childCount ?? 0,
        childDoneCount: t.childDoneCount ?? 0,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
      content = JSON.stringify({ tickets: data, exportedAt: new Date().toISOString() }, null, 2);
      mimeType = "application/json";
      filename = `${workspacePrefix}-tickets.json`;
    } else {
      const escapeCSV = (v: unknown) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const cols = ["id","number","title","status","priority","ownerId","ownerType","ownerDisplayName","parentId","archived","childCount","childDoneCount","createdAt","updatedAt"];
      const header = cols.join(",");
      const rows = tickets.map((t) => {
        const vals: Record<string, unknown> = {
          id: t._id, number: t.number ?? "", title: t.title, status: t.status,
          priority: t.priority ?? "none", ownerId: t.ownerId ?? "", ownerType: t.ownerType ?? "",
          ownerDisplayName: t.ownerDisplayName ?? "", parentId: t.parentId ?? "",
          archived: t.archived ?? false, childCount: t.childCount ?? 0,
          childDoneCount: t.childDoneCount ?? 0, createdAt: t.createdAt, updatedAt: t.updatedAt,
        };
        return cols.map((c) => escapeCSV(vals[c])).join(",");
      });
      content = [header, ...rows].join("\n");
      mimeType = "text/csv";
      filename = `${workspacePrefix}-tickets.csv`;
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleShowArchived = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (showArchived) {
      params.delete("archived");
    } else {
      params.set("archived", "1");
    }
    startTransition(() => {
      router.replace(`/workspace/${workspaceId}?${params.toString()}`);
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-16 items-center justify-between border-b-2 border-b-border bg-card pl-12 pr-4 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate font-sans text-[22px] font-semibold tracking-[0.04em] text-foreground md:text-[30px]">
            {workspace.name.toUpperCase()}
          </h1>
          <span className="hidden font-mono text-[11px] text-muted-foreground/70 md:inline">
            {searchQuery.trim()
              ? `${visibleTickets.length}/${allVisibleTickets.length} ISSUES`
              : `${visibleTickets.length} ISSUES`}
          </span>
          <span className="hidden h-4 w-px bg-border md:inline" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 md:inline">
            {workspacePrefix}-001
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("tab", "board");
              startTransition(() => {
                router.replace(`/workspace/${workspaceId}?${params.toString()}`);
              });
            }}
            className={`border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition-colors md:px-3 md:py-1.5 md:text-[10px] ${
              activeTab === "board" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"
            }`}
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("tab", "list");
              startTransition(() => {
                router.replace(`/workspace/${workspaceId}?${params.toString()}`);
              });
            }}
            className={`border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition-colors md:px-3 md:py-1.5 md:text-[10px] ${
              activeTab === "list" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"
            }`}
          >
            List
          </button>
          <Link
            href={`/workspace/${workspaceId}/settings`}
            className="ml-2 hidden border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground md:inline-flex"
          >
            Settings
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="flex h-10 items-center gap-4 border-b border-b-muted bg-background px-4 md:gap-8 md:px-7">
        {backlogCount > 0 && (
          <div className="hidden items-center gap-2 md:flex">
            <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.backlog }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">Backlog</span>
            <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.backlog }}>
              {backlogCount}
            </span>
          </div>
        )}
        <div className="hidden items-center gap-2 md:flex">
          <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.unclaimed }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">Unclaimed</span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.unclaimed }}>
            {unclaimedCount}
          </span>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.dispatched }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">Dispatched</span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.dispatched }}>
            {dispatchedCount}
          </span>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.in_progress }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">In Progress</span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.in_progress }}>
            {inProgressCount}
          </span>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.done }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">Done</span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.done }}>
            {doneCount}
          </span>
        </div>
        {/* Mobile: compact status counts */}
        <div className="flex items-center gap-3 md:hidden">
          {backlogCount > 0 && (
            <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.backlog }}>
              {backlogCount}
            </span>
          )}
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.unclaimed }}>
            {unclaimedCount}
          </span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.dispatched }}>
            {dispatchedCount}
          </span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.in_progress }}>
            {inProgressCount}
          </span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.done }}>
            {doneCount}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <div className="relative flex items-center">
            <Search className="absolute left-2 h-3 w-3 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-6 w-28 border border-border bg-background/70 pl-6 pr-6 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:w-40 transition-all md:w-36 md:focus:w-48"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 text-muted-foreground/50 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {activeTab === "board" && (
            <select
              value={boardSort}
              onChange={(event) => setBoardSort(event.target.value as BoardSortOption)}
              className="h-6 border border-border bg-background/70 px-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground outline-none focus:border-primary/50"
            >
              <option value="order">Manual</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
              <option value="priority">Priority</option>
            </select>
          )}
          <Link
            href={`/workspace/${workspaceId}/tickets/new`}
            className="border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground/80"
          >
            + New
          </Link>
          <button
            type="button"
            onClick={toggleShowArchived}
            className="hidden border border-border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground/80 md:inline-flex"
          >
            {showArchived ? "Hide Archived" : "Show Archived"}
          </button>
          <div className="hidden items-center md:flex">
            <button
              type="button"
              onClick={() => exportTickets("json")}
              className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground/80"
              title="Export as JSON"
            >
              <Download className="h-3 w-3" />
              JSON
            </button>
            <button
              type="button"
              onClick={() => exportTickets("csv")}
              className="inline-flex items-center gap-1 border border-l-0 border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground/80"
              title="Export as CSV"
            >
              CSV
            </button>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/60">Completion</span>
            <div className="relative h-1 w-[120px] bg-muted">
              <div
                className="absolute left-0 top-0 h-full bg-done"
                style={{ width: `${completionDoneWidth}%` }}
              />
              <div
                className="absolute top-0 h-full bg-in-progress"
                style={{ left: `${completionDoneWidth}%`, width: `${completionInProgressWidth}%` }}
              />
            </div>
            <span className="font-mono text-[10px] font-extrabold text-done">{completionPct}%</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden border-t-2 border-t-primary">
        {activeTab === "board" ? (
          <KanbanBoard
            workspaceId={workspaceId}
            tickets={searchQuery.trim() ? visibleTickets : tickets}
            workspacePrefix={workspacePrefix}
            showArchived={searchQuery.trim() ? true : showArchived}
            sortBy={boardSort}
            visibleStatuses={statusFilter}
            onVisibleStatusesChange={setStatusFilter}
            compact
            toolbarAction={
              <DispatchTicketsButton
                workspaceId={workspaceId}
                workspacePrefix={workspacePrefix}
                tickets={dispatchableTickets.map((ticket) => ({
                  _id: ticket._id,
                  number: ticket.number ?? undefined,
                  title: ticket.title,
                  status: ticket.status,
                }))}
                triggerClassName="h-7 border border-primary/70 bg-primary px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.15)] hover:bg-primary/90 hover:border-primary"
              />
            }
          />
        ) : (
          <TicketTable
            workspaceId={workspaceId}
            tickets={searchQuery.trim() ? visibleTickets : tickets}
            workspacePrefix={workspacePrefix}
            showArchived={searchQuery.trim() ? true : showArchived}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            compact
            persistKey={`workspace:${workspaceId}`}
            toolbarAction={
              <DispatchTicketsButton
                workspaceId={workspaceId}
                workspacePrefix={workspacePrefix}
                tickets={dispatchableTickets.map((ticket) => ({
                  _id: ticket._id,
                  number: ticket.number ?? undefined,
                  title: ticket.title,
                  status: ticket.status,
                }))}
                triggerClassName="h-7 border border-primary/70 bg-primary px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.15)] hover:bg-primary/90 hover:border-primary"
              />
            }
          />
        )}
      </div>

      <footer className="flex h-7 items-center justify-between border-t border-border bg-card px-4 md:px-7">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground/50">KANBANTHING://{workspacePrefix}</span>
          <span className="font-mono text-[8px] text-muted-foreground/50">|</span>
          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground/60">Convex: Connected</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground/50">Sync: Real-time</span>
          <span className="font-mono text-[8px] text-primary">█</span>
        </div>
      </footer>
    </div>
  );
}
