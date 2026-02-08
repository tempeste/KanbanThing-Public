"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Settings, LayoutGrid, List } from "lucide-react";
import { KanbanBoard } from "@/components/kanban-board";
import { TicketTable } from "@/components/ticket-table";
import { generateWorkspacePrefix } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = params.id as Id<"workspaces">;

  const workspace = useQuery(api.workspaces.get, { id: workspaceId });
  const tickets = useQuery(api.tickets.list, { workspaceId });
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "list" || tabParam === "board" ? tabParam : "board";

  if (workspace === undefined || tickets === undefined) {
    return (
      <main className="min-h-screen p-4 md:p-6">
        <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-8 md:min-h-[calc(100vh-3rem)]">
          <div className="kb-label">Loading workspace state...</div>
        </div>
      </main>
    );
  }

  if (workspace === null) {
    return (
      <main className="min-h-screen p-4 md:p-6">
        <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-8 text-center md:min-h-[calc(100vh-3rem)]">
          <div>
            <h1 className="kb-title mb-3">Workspace Not Found</h1>
            <Link href="/">
              <Button>Go Home</Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const workspacePrefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);
  const doneCount = tickets.filter((ticket) => ticket.status === "done").length;
  const inProgressCount = tickets.filter((ticket) => ticket.status === "in_progress").length;
  const unclaimedCount = tickets.filter((ticket) => ticket.status === "unclaimed").length;

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="kb-shell kb-scroll min-h-[calc(100vh-2rem)] overflow-hidden md:min-h-[calc(100vh-3rem)]">
        <header className="kb-header border-b-2 border-primary/45 px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <div className="kb-label mb-1">Workspace {workspacePrefix}</div>
                <h1 className="kb-title text-2xl md:text-3xl">{workspace.name}</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tickets.length} issue{tickets.length !== 1 ? "s" : ""} tracked in real time.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/workspace/${workspaceId}/settings`}>
                <Button variant="outline">
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </Link>
              <UserMenu />
            </div>
          </div>
        </header>

        <section className="border-b border-border/80 bg-card/60 px-4 py-4 md:px-6">
          <div className="flex flex-wrap gap-2">
            <div className="kb-chip">Unclaimed: {unclaimedCount}</div>
            <div className="kb-chip">In Progress: {inProgressCount}</div>
            <div className="kb-chip">Done: {doneCount}</div>
          </div>
        </section>

        <section className="p-4 md:p-6">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("tab", value);
              router.replace(`/workspace/${workspaceId}?${params.toString()}`);
            }}
            className="w-full"
          >
            <TabsList className="mb-6">
              <TabsTrigger value="board" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                Board
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2">
                <List className="h-4 w-4" />
                List
              </TabsTrigger>
            </TabsList>
            <TabsContent value="board">
              <KanbanBoard
                workspaceId={workspaceId}
                tickets={tickets}
                workspacePrefix={workspacePrefix}
              />
            </TabsContent>
            <TabsContent value="list">
              <TicketTable
                workspaceId={workspaceId}
                tickets={tickets}
                workspacePrefix={workspacePrefix}
              />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
}
