"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, FolderKanban, ArrowRight, Trash2, LogIn } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { UserMenu } from "@/components/user-menu";

export default function Home() {
  const { data: session, isPending: isSessionPending } = useSession();
  const userId = session?.user?.id;

  // Query workspaces based on auth state
  const workspaces = useQuery(
    api.workspaces.listForUser,
    userId ? { betterAuthUserId: userId } : "skip"
  );

  const createWorkspace = useMutation(api.workspaces.createWithOwner);
  const deleteWorkspace = useMutation(api.workspaces.removeWithCleanup);
  const assignOrphaned = useMutation(api.migrations.assignOrphanedWorkspaces);

  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [hasMigrated, setHasMigrated] = useState(false);

  // Migrate orphaned workspaces on first login
  useEffect(() => {
    if (userId && !hasMigrated) {
      assignOrphaned({ betterAuthUserId: userId })
        .then((result) => {
          if (result.count > 0) {
            console.log(`Claimed ${result.count} orphaned workspaces:`, result.claimed);
          }
        })
        .catch(console.error);
      setHasMigrated(true);
    }
  }, [userId, hasMigrated, assignOrphaned]);

  const handleCreate = async () => {
    if (!newWorkspaceName.trim() || !userId) return;
    await createWorkspace({
      name: newWorkspaceName.trim(),
      betterAuthUserId: userId,
    });
    setNewWorkspaceName("");
    setIsCreating(false);
  };

  const handleDelete = async (id: Id<"workspaces">) => {
    if (!userId) return;
    if (confirm("Delete this workspace and all its issues?")) {
      await deleteWorkspace({ id, betterAuthUserId: userId });
    }
  };

  // Show loading state
  if (isSessionPending) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </main>
    );
  }

  // Show login prompt if not authenticated
  if (!session?.user) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">
              <span className="text-primary">Kanban</span>Thing
            </CardTitle>
            <CardDescription className="text-base">
              Task management for humans and LLM agents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">
              Sign in to create and manage your workspaces
            </p>
            <Link href="/login" className="block">
              <Button className="w-full" size="lg">
                <LogIn className="w-5 h-5 mr-2" />
                Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              <span className="text-primary">Kanban</span>Thing
            </h1>
            <p className="text-muted-foreground text-lg">
              Task management for humans and LLM agents
            </p>
          </div>
          <UserMenu />
        </div>

        <div className="mb-8">
          {!isCreating ? (
            <Button onClick={() => setIsCreating(true)} size="lg">
              <Plus className="w-5 h-5 mr-2" />
              New Workspace
            </Button>
          ) : (
            <Card className="max-w-md">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Create Workspace</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreate();
                  }}
                  className="flex gap-3"
                >
                  <Input
                    placeholder="Workspace name"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    autoFocus
                  />
                  <Button type="submit">Create</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreating(false)}
                  >
                    Cancel
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workspaces === undefined ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              Loading workspaces...
            </div>
          ) : workspaces.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No workspaces yet. Create one to get started.
            </div>
          ) : (
            workspaces.map((workspace) => (
              <Card
                key={workspace._id}
                className="group hover:border-primary/50 transition-colors"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <FolderKanban className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">{workspace.name}</CardTitle>
                        {workspace.role && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {workspace.role}
                          </span>
                        )}
                      </div>
                    </div>
                    {workspace.role === "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDelete(workspace._id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <CardDescription className="mt-2">
                    {workspace.docs
                      ? workspace.docs.slice(0, 100) + (workspace.docs.length > 100 ? "..." : "")
                      : "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <Link href={`/workspace/${workspace._id}`}>
                    <Button variant="outline" className="w-full group/btn">
                      Open Board
                      <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
