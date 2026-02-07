"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Plus, FolderKanban, ArrowRight, Trash2, LogIn, LayoutGrid, Table } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { UserMenu } from "@/components/user-menu";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const { data: session, isPending: isSessionPending } = useSession();
  const userId = session?.user?.id;

  // Query workspaces based on auth state
  const workspaces = useQuery(api.workspaces.listForUser, userId ? {} : "skip");

  const createWorkspace = useMutation(api.workspaces.createWithOwner);
  const deleteWorkspace = useMutation(api.workspaces.removeWithCleanup);
  const assignOrphaned = useMutation(api.migrations.assignOrphanedWorkspaces);

  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [hasMigrated, setHasMigrated] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "owner" | "admin" | "member">("all");
  const [sortKey, setSortKey] = useState<
    "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "name_asc" | "name_desc"
  >("updated_desc");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const router = useRouter();

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
    });
    setNewWorkspaceName("");
    setIsCreating(false);
  };

  const handleDelete = async (id: Id<"workspaces">) => {
    if (!userId) return;
    if (confirm("Delete this workspace and all its issues?")) {
      await deleteWorkspace({ id });
    }
  };

  const filteredWorkspaces = useMemo(() => {
    if (!workspaces) return [];
    const term = searchTerm.trim().toLowerCase();
    const filtered = workspaces.filter((workspace) => {
      if (roleFilter !== "all" && workspace.role !== roleFilter) return false;
      if (!term) return true;
      const name = workspace.name.toLowerCase();
      const docs = workspace.docs?.toLowerCase() ?? "";
      return name.includes(term) || docs.includes(term);
    });

    const sorted = filtered.slice().sort((a, b) => {
      const aUpdated = a.updatedAt ?? a.createdAt;
      const bUpdated = b.updatedAt ?? b.createdAt;
      switch (sortKey) {
        case "updated_desc":
          return bUpdated - aUpdated;
        case "updated_asc":
          return aUpdated - bUpdated;
        case "created_desc":
          return b.createdAt - a.createdAt;
        case "created_asc":
          return a.createdAt - b.createdAt;
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "name_asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return sorted;
  }, [workspaces, roleFilter, searchTerm, sortKey]);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "—";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(timestamp));
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

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium">Search</div>
              <Input
                placeholder="Search by name or description"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Filter</div>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(e.target.value as "all" | "owner" | "admin" | "member")
                  }
                >
                  <option value="all">All roles</option>
                  <option value="owner">Owners</option>
                  <option value="admin">Admins</option>
                  <option value="member">Members</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Sort</div>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  value={sortKey}
                  onChange={(e) =>
                    setSortKey(
                      e.target.value as
                        | "updated_desc"
                        | "updated_asc"
                        | "created_desc"
                        | "created_asc"
                        | "name_asc"
                        | "name_desc"
                    )
                  }
                >
                  <option value="updated_desc">Updated (newest)</option>
                  <option value="updated_asc">Updated (oldest)</option>
                  <option value="created_desc">Created (newest)</option>
                  <option value="created_asc">Created (oldest)</option>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="name_desc">Name (Z-A)</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {workspaces !== undefined && (
              <div className="text-sm text-muted-foreground">
                {filteredWorkspaces.length} of {workspaces.length} workspaces
              </div>
            )}
            <Tabs
              value={viewMode}
              onValueChange={(value) => setViewMode(value as "cards" | "table")}
            >
              <TabsList>
                <TabsTrigger value="cards">
                  <LayoutGrid className="h-4 w-4" />
                  Cards
                </TabsTrigger>
                <TabsTrigger value="table">
                  <Table className="h-4 w-4" />
                  Table
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {workspaces === undefined ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Loading workspaces...
          </div>
        ) : filteredWorkspaces.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            {workspaces.length === 0
              ? "No workspaces yet. Create one to get started."
              : "No workspaces match your search."}
          </div>
        ) : viewMode === "cards" ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredWorkspaces.map((workspace) => (
              <Card
                key={workspace._id}
                role="button"
                tabIndex={0}
                className="group cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => router.push(`/workspace/${workspace._id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/workspace/${workspace._id}`);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <FolderKanban className="h-5 w-5" />
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
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(workspace._id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <CardDescription className="mt-2">
                    {workspace.docs
                      ? workspace.docs.slice(0, 100) + (workspace.docs.length > 100 ? "..." : "")
                      : "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Created {formatDate(workspace.createdAt)}</span>
                    <span>Updated {formatDate(workspace.updatedAt ?? workspace.createdAt)}</span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full group/btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/workspace/${workspace._id}`);
                    }}
                  >
                    Open Board
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left">Workspace</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkspaces.map((workspace) => (
                  <tr
                    key={workspace._id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => router.push(`/workspace/${workspace._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/workspace/${workspace._id}`);
                      }
                    }}
                  >
                    <td className="px-4 py-3 font-medium">{workspace.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {workspace.docs
                        ? workspace.docs.slice(0, 80) +
                          (workspace.docs.length > 80 ? "..." : "")
                        : "No description"}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {workspace.role ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(workspace.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(workspace.updatedAt ?? workspace.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/workspace/${workspace._id}`);
                          }}
                        >
                          Open
                        </Button>
                        {workspace.role === "owner" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(workspace._id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
