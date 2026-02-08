"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { deriveVisibleTickets } from "@/lib/ticket-derivations";
import { Menu, Settings } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

interface WorkspaceSidebarProps {
  workspaceId: Id<"workspaces">;
}

export function WorkspaceSidebar({ workspaceId }: WorkspaceSidebarProps) {
  const { isAuthenticated } = useConvexAuth();
  const searchParams = useSearchParams();
  const showArchived = searchParams.get("archived") === "1";

  const userWorkspaces =
    useQuery(api.workspaces.listSidebar, isAuthenticated ? {} : "skip") ?? [];
  const workspace = useQuery(
    api.workspaces.get,
    isAuthenticated ? { id: workspaceId } : "skip"
  );
  const tickets = useQuery(
    api.tickets.listSummaries,
    isAuthenticated ? { workspaceId } : "skip"
  );

  const visibleTickets = tickets ? deriveVisibleTickets(tickets, showArchived) : [];
  const onlineAgents = new Set(
    visibleTickets
      .filter((t) => t.ownerType === "agent")
      .map((t) => t.ownerDisplayName ?? t.ownerId ?? "agent")
  ).size;

  const [timeStr, setTimeStr] = useState(() =>
    new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeStr(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const sidebarWorkspaces =
    userWorkspaces.length > 0
      ? userWorkspaces
      : workspace
        ? [{ ...workspace, role: "owner" as const }]
        : [];

  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (onNavigate?: () => void) => (
    <>
      <Link
        href="/"
        onClick={onNavigate}
        className="block border-b border-border px-4 pb-4 pt-5 transition hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/70"
      >
        <div className="flex items-center gap-2 font-mono text-sm font-extrabold tracking-[0.2em] text-foreground">
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center bg-primary text-[10px] font-black text-primary-foreground">
            K
          </span>
          KANBAN
          <span className="text-primary">THING</span>
        </div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground/60">
          Task control sys v1.0
        </div>
      </Link>

      <div className="px-4 pt-3 font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground/60">
        Workspaces
      </div>

      <div className="kb-scroll mt-2 flex-1 overflow-y-auto">
        {sidebarWorkspaces.length > 0
          ? sidebarWorkspaces.map((ws) => {
              const active = ws._id === workspaceId;
              const count = active ? visibleTickets.length : "--";
              return (
                <Link
                  key={ws._id}
                  href={`/workspace/${ws._id}`}
                  onClick={onNavigate}
                  className={`flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.08em] transition ${
                    active
                      ? "bg-foreground font-extrabold text-background"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className={`h-[6px] w-[6px] shrink-0 ${active ? "bg-primary" : "bg-muted-foreground/40"}`}
                    />
                    <span className="truncate">{ws.name}</span>
                  </span>
                  <span
                    className={`ml-2 font-mono text-[10px] font-extrabold ${active ? "text-primary" : "text-muted-foreground/70"}`}
                  >
                    {count}
                  </span>
                </Link>
              );
            })
          : Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="border-b border-border px-4 py-2.5">
                <div className="h-3 w-full animate-pulse bg-muted" />
              </div>
            ))}
      </div>

      <div className="border-t border-border">
        <Link
          href={`/workspace/${workspaceId}/settings`}
          onClick={onNavigate}
          className="flex w-full items-center gap-2 border-b border-border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition hover:bg-accent"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-[6px] w-[6px] bg-done" />
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">
                  {onlineAgents} Agents online
                </span>
              </div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/50">
                Sys {timeStr} utc
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="relative z-10 hidden w-[206px] shrink-0 border-r-[3px] border-r-primary bg-card md:flex md:flex-col">
        {sidebarContent()}
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="fixed left-3 top-4.5 z-50 border border-border bg-card p-1.5 text-muted-foreground transition hover:text-foreground md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[240px] gap-0 border-r-[3px] border-r-primary bg-card p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            {sidebarContent(() => setMobileOpen(false))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
