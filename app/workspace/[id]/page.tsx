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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (workspace === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Workspace not found</h1>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }
  const workspacePrefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">{workspace.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {tickets.length} issue{tickets.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <Link href={`/workspace/${workspaceId}/settings`}>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
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
              <LayoutGrid className="w-4 h-4" />
              Board
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <List className="w-4 h-4" />
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
      </main>
    </div>
  );
}
