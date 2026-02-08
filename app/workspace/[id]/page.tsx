"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/kanban-board";
import { TicketTable } from "@/components/ticket-table";
import { generateWorkspacePrefix } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { useSession } from "@/lib/auth-client";
import { deriveVisibleTickets } from "@/lib/ticket-derivations";

const STATUS_ACCENTS = {
  unclaimed: "var(--unclaimed)",
  in_progress: "var(--in-progress)",
  done: "var(--done)",
} as const;

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = params.id as Id<"workspaces">;
  const { data: session, isPending: isSessionPending } = useSession();
  const userId = session?.user?.id;
  const canQueryWorkspace = Boolean(userId);

  const workspace = useQuery(
    api.workspaces.get,
    canQueryWorkspace ? { id: workspaceId } : "skip"
  );
  const tickets = useQuery(
    api.tickets.listSummaries,
    canQueryWorkspace ? { workspaceId } : "skip"
  );
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "list" || tabParam === "board" ? tabParam : "board";
  const showArchived = searchParams.get("archived") === "1";

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
        <header className="flex h-16 items-center justify-between border-b-2 border-b-border bg-card px-4 md:px-7">
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
  const visibleTickets = deriveVisibleTickets(tickets, showArchived);
  const doneCount = visibleTickets.filter((ticket) => ticket.status === "done").length;
  const inProgressCount = visibleTickets.filter(
    (ticket) => ticket.status === "in_progress"
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

  const toggleShowArchived = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (showArchived) {
      params.delete("archived");
    } else {
      params.set("archived", "1");
    }
    router.replace(`/workspace/${workspaceId}?${params.toString()}`);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-16 items-center justify-between border-b-2 border-b-border bg-card px-4 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate font-sans text-[28px] font-semibold tracking-[0.04em] text-foreground md:text-[30px]">
            {workspace.name.toUpperCase()}
          </h1>
          <span className="hidden font-mono text-[11px] text-muted-foreground/70 md:inline">
            {visibleTickets.length} ISSUES
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
              router.replace(`/workspace/${workspaceId}?${params.toString()}`);
            }}
            className={`border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
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
              router.replace(`/workspace/${workspaceId}?${params.toString()}`);
            }}
            className={`border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
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

      <div className="flex h-10 items-center gap-8 border-b border-b-muted bg-background px-4 md:px-7">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.unclaimed }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">Unclaimed</span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.unclaimed }}>
            {unclaimedCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.in_progress }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">In Progress</span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.in_progress }}>
            {inProgressCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.done }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">Done</span>
          <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.done }}>
            {doneCount}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href={`/workspace/${workspaceId}/tickets/new`}
            className="hidden border border-border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground/80 md:inline-flex"
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
            tickets={tickets}
            workspacePrefix={workspacePrefix}
            showArchived={showArchived}
            compact
          />
        ) : (
          <TicketTable
            workspaceId={workspaceId}
            tickets={tickets}
            workspacePrefix={workspacePrefix}
            showArchived={showArchived}
            compact
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
