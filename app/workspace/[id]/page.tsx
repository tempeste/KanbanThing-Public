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

const STATUS_ACCENTS = {
  unclaimed: "#FF3B00",
  in_progress: "#FFB800",
  done: "#00FF94",
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
    api.tickets.list,
    canQueryWorkspace ? { workspaceId } : "skip"
  );
  const userWorkspaces = useQuery(api.workspaces.listForUser, userId ? {} : "skip") ?? [];
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "list" || tabParam === "board" ? tabParam : "board";

  if (isSessionPending) {
    return (
      <main className="min-h-screen p-4 md:p-6">
        <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-8 md:min-h-[calc(100vh-3rem)]">
          <div className="kb-label">Loading workspace...</div>
        </div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="min-h-screen p-4 md:p-6">
        <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-6 md:min-h-[calc(100vh-3rem)]">
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
      </main>
    );
  }

  if (workspace === undefined || tickets === undefined) {
    const loadingWorkspaces = userWorkspaces.slice(0, 6);

    return (
      <div className="relative flex h-screen w-screen overflow-hidden bg-[#0a0a0a] text-[#ccc]" aria-busy="true">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-[size:40px_40px]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          }}
        />

        <aside className="relative z-10 hidden w-[206px] shrink-0 border-r-[3px] border-r-[#FF3B00] bg-[#0d0d0d] md:flex md:flex-col">
          <Link
            href="/"
            className="block border-b border-[#333] px-4 pb-4 pt-5 transition hover:bg-[#141414] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B00]/70"
          >
            <div className="flex items-center gap-2 font-mono text-sm font-extrabold tracking-[0.2em] text-white">
              <span className="inline-flex h-[18px] w-[18px] items-center justify-center bg-[#FF3B00] text-[10px] font-black text-black">
                K
              </span>
              KANBAN
              <span className="text-[#FF3B00]">THING</span>
            </div>
            <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-[#444]">Task control sys v1.0</div>
          </Link>

          <div className="px-4 pt-3 font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[#444]">Workspaces</div>

          <div className="kb-scroll mt-2 flex-1 overflow-y-auto">
            {loadingWorkspaces.length > 0
              ? loadingWorkspaces.map((ws) => (
                  <div
                    key={ws._id}
                    className="flex w-full items-center justify-between border-b border-[#222] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#666]"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="h-[6px] w-[6px] shrink-0 bg-[#444]" />
                      <span className="truncate">{ws.name}</span>
                    </span>
                    <span className="ml-2 h-3 w-6 animate-pulse bg-[#1c1c1c]" />
                  </div>
                ))
              : Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="border-b border-[#222] px-4 py-2.5">
                    <div className="h-3 w-full animate-pulse bg-[#1c1c1c]" />
                  </div>
                ))}
          </div>

          <div className="border-t border-[#222] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-[6px] w-[6px] bg-[#666]" />
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#555]">Loading workspace</span>
            </div>
          </div>
        </aside>

        <main className="relative z-10 flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b-2 border-b-[#222] bg-[#0d0d0d] px-4 md:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-8 w-52 animate-pulse bg-[#1a1a1a]" />
              <div className="hidden h-3 w-16 animate-pulse bg-[#1a1a1a] md:block" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-16 animate-pulse border border-[#333] bg-[#101010]" />
              <div className="h-7 w-16 animate-pulse border border-[#333] bg-[#101010]" />
              <div className="ml-2 h-8 w-8 animate-pulse rounded-full bg-[#1a1a1a]" />
            </div>
          </header>

          <div className="flex h-10 items-center gap-8 border-b border-b-[#1a1a1a] bg-[#0a0a0a] px-4 md:px-7">
            <div className="h-3 w-24 animate-pulse bg-[#1a1a1a]" />
            <div className="h-3 w-24 animate-pulse bg-[#1a1a1a]" />
            <div className="h-3 w-24 animate-pulse bg-[#1a1a1a]" />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden border-t-2 border-t-[#FF3B00]">
            <div className="grid h-full md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, columnIndex) => (
                <section
                  key={columnIndex}
                  className={`flex min-h-0 flex-col border-[#222] ${columnIndex < 2 ? "border-r" : ""}`}
                >
                  <div className="border-b border-[#222] px-4 pb-3 pt-4 md:px-5">
                    <div className="h-6 w-36 animate-pulse bg-[#1a1a1a]" />
                  </div>
                  <div className="space-y-2.5 p-3">
                    {Array.from({ length: 3 }).map((_, cardIndex) => (
                      <div key={cardIndex} className="border border-[#2a2a2a] bg-[#101010] p-4">
                        <div className="h-3 w-24 animate-pulse bg-[#1d1d1d]" />
                        <div className="mt-3 h-4 w-full animate-pulse bg-[#1d1d1d]" />
                        <div className="mt-2 h-4 w-4/5 animate-pulse bg-[#1d1d1d]" />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <footer className="flex h-7 items-center justify-between border-t border-[#222] bg-[#0d0d0d] px-4 md:px-7">
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#444]">Loading workspace state...</span>
            <span className="font-mono text-[8px] text-[#333]">...</span>
          </footer>
        </main>
      </div>
    );
  }

  if (workspace === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-center text-[#ddd]">
        <div>
          <h1 className="mb-4 text-2xl font-bold">Workspace not found</h1>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </main>
    );
  }

  const workspacePrefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);
  const activeTickets = tickets.filter((ticket) => !(ticket.archived ?? false));
  const doneCount = activeTickets.filter((ticket) => ticket.status === "done").length;
  const inProgressCount = activeTickets.filter((ticket) => ticket.status === "in_progress").length;
  const unclaimedCount = activeTickets.filter((ticket) => ticket.status === "unclaimed").length;
  const completionPct =
    activeTickets.length === 0 ? 0 : Math.round((doneCount / activeTickets.length) * 100);
  const completionDoneWidth =
    activeTickets.length === 0 ? 0 : Math.round((doneCount / activeTickets.length) * 100);
  const completionInProgressWidth =
    activeTickets.length === 0
      ? 0
      : Math.round((inProgressCount / activeTickets.length) * 100);
  const onlineAgents = new Set(
    tickets
      .filter((ticket) => ticket.ownerType === "agent")
      .map((ticket) => ticket.ownerDisplayName ?? ticket.ownerId ?? "agent")
  ).size;
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const sidebarWorkspaces =
    userWorkspaces.length > 0 ? userWorkspaces : [{ ...workspace, role: "owner" as const }];

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#0a0a0a] text-[#ccc]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[size:40px_40px]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
        }}
      />

      <aside className="relative z-10 hidden w-[206px] shrink-0 border-r-[3px] border-r-[#FF3B00] bg-[#0d0d0d] md:flex md:flex-col">
        <Link
          href="/"
          className="block border-b border-[#333] px-4 pb-4 pt-5 transition hover:bg-[#141414] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B00]/70"
        >
          <div className="flex items-center gap-2 font-mono text-sm font-extrabold tracking-[0.2em] text-white">
            <span className="inline-flex h-[18px] w-[18px] items-center justify-center bg-[#FF3B00] text-[10px] font-black text-black">
              K
            </span>
            KANBAN
            <span className="text-[#FF3B00]">THING</span>
          </div>
          <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-[#444]">Task control sys v1.0</div>
        </Link>

        <div className="px-4 pt-3 font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[#444]">Workspaces</div>

        <div className="kb-scroll mt-2 flex-1 overflow-y-auto">
          {sidebarWorkspaces.map((ws) => {
            const active = ws._id === workspaceId;
            const count = ws._id === workspaceId ? activeTickets.length : "--";
            return (
              <Link
                key={ws._id}
                href={`/workspace/${ws._id}`}
                className={`flex w-full items-center justify-between border-b border-[#222] px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.08em] transition ${
                  active ? "bg-white font-extrabold text-black" : "text-[#888] hover:bg-[#161616]"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="h-[6px] w-[6px] shrink-0"
                    style={{ background: active ? "#FF3B00" : "#444" }}
                  />
                  <span className="truncate">{ws.name}</span>
                </span>
                <span className={`ml-2 font-mono text-[10px] font-extrabold ${active ? "text-[#FF3B00]" : "text-[#555]"}`}>
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="border-t border-[#222] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-[6px] w-[6px] bg-[#00FF94]" />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#555]">
              {onlineAgents} Agents online
            </span>
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#333]">Sys {timeStr} utc</div>
        </div>
      </aside>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b-2 border-b-[#222] bg-[#0d0d0d] px-4 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate font-sans text-[28px] font-semibold tracking-[0.04em] text-white md:text-[30px]">
              {workspace.name.toUpperCase()}
            </h1>
            <span className="hidden font-mono text-[11px] text-[#555] md:inline">
              {activeTickets.length} ISSUES
            </span>
            <span className="hidden h-4 w-px bg-[#333] md:inline" />
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-[#333] md:inline">
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
                activeTab === "board" ? "border-white bg-white text-black" : "border-[#333] text-[#666]"
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
                activeTab === "list" ? "border-white bg-white text-black" : "border-[#333] text-[#666]"
              }`}
            >
              List
            </button>
            <Link
              href={`/workspace/${workspaceId}/settings`}
              className="ml-2 hidden border border-[#333] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#666] transition hover:border-[#555] hover:text-[#c8c8c8] md:inline-flex"
            >
              Settings
            </Link>
            <UserMenu />
          </div>
        </header>

        <div className="flex h-10 items-center gap-8 border-b border-b-[#1a1a1a] bg-[#0a0a0a] px-4 md:px-7">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.unclaimed }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#555]">Unclaimed</span>
            <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.unclaimed }}>
              {unclaimedCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.in_progress }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#555]">In Progress</span>
            <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.in_progress }}>
              {inProgressCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2" style={{ background: STATUS_ACCENTS.done }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#555]">Done</span>
            <span className="font-mono text-[9px] font-extrabold" style={{ color: STATUS_ACCENTS.done }}>
              {doneCount}
            </span>
          </div>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#444]">Completion</span>
            <div className="relative h-1 w-[120px] bg-[#1a1a1a]">
              <div
                className="absolute left-0 top-0 h-full bg-[#00FF94]"
                style={{ width: `${completionDoneWidth}%` }}
              />
              <div
                className="absolute top-0 h-full bg-[#FFB800]"
                style={{ left: `${completionDoneWidth}%`, width: `${completionInProgressWidth}%` }}
              />
            </div>
            <span className="font-mono text-[10px] font-extrabold text-[#00FF94]">{completionPct}%</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden border-t-2 border-t-[#FF3B00]">
          {activeTab === "board" ? (
            <KanbanBoard workspaceId={workspaceId} tickets={tickets} workspacePrefix={workspacePrefix} compact />
          ) : (
            <TicketTable workspaceId={workspaceId} tickets={tickets} workspacePrefix={workspacePrefix} compact />
          )}
        </div>

        <footer className="flex h-7 items-center justify-between border-t border-[#222] bg-[#0d0d0d] px-4 md:px-7">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-[#333]">KANBANTHING://{workspacePrefix}</span>
            <span className="font-mono text-[8px] text-[#333]">|</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#444]">Convex: Connected</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#333]">Sync: Real-time</span>
            <span className="font-mono text-[8px] text-[#FF3B00]">█</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
