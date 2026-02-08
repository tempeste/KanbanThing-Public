"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  FolderKanban,
  ArrowRight,
  Trash2,
  LogIn,
  LayoutGrid,
  Table,
  Search,
} from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { UserMenu } from "@/components/user-menu";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const { data: session, isPending: isSessionPending } = useSession();
  const userId = session?.user?.id;

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
    await createWorkspace({ name: newWorkspaceName.trim() });
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

    return filtered.slice().sort((a, b) => {
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
  }, [workspaces, roleFilter, searchTerm, sortKey]);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "--";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(timestamp));
  };

  if (isSessionPending) {
    return (
      <main className="min-h-screen p-4 md:p-6">
        <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-8 md:min-h-[calc(100vh-3rem)]">
          <div className="kb-label">Connecting to workspace index...</div>
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
              Real-time issue control for human and agent collaboration.
            </p>
            <Link href="/login" className="block">
              <Button className="w-full" size="lg">
                <LogIn className="mr-2 h-4 w-4" />
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="kb-shell kb-scroll min-h-[calc(100vh-2rem)] overflow-hidden md:min-h-[calc(100vh-3rem)]">
        <header className="kb-header border-b-2 border-primary/45 px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="kb-label mb-2">Workspace Control Plane</div>
              <h1 className="kb-title text-3xl md:text-4xl">
                KANBAN<span className="text-primary">THING</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Operate your teams and agents from one board-first workspace index.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setIsCreating((prev) => !prev)}>
                <Plus className="h-4 w-4" />
                {isCreating ? "Close" : "New Workspace"}
              </Button>
              <UserMenu />
            </div>
          </div>
        </header>

        {isCreating && (
          <section className="border-b border-border/80 bg-card/60 px-4 py-4 md:px-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleCreate();
              }}
              className="flex flex-col gap-3 md:flex-row"
            >
              <Input
                placeholder="Workspace name"
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={!newWorkspaceName.trim()}>
                <Plus className="h-4 w-4" />
                Create
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </form>
          </section>
        )}

        <section className="border-b border-border/70 bg-background/70 px-4 py-4 md:px-6">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto] xl:items-end">
            <label className="space-y-2">
              <span className="kb-label">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name or docs"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </label>
            <label className="space-y-2">
              <span className="kb-label">Role Filter</span>
              <select
                className="h-10 w-full border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value as "all" | "owner" | "admin" | "member")
                }
              >
                <option value="all">All roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="kb-label">Sort</span>
              <select
                className="h-10 w-full border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                value={sortKey}
                onChange={(event) =>
                  setSortKey(
                    event.target.value as
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
            </label>
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "cards" | "table")}> 
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
        </section>

        <section className="kb-scroll max-h-[calc(100vh-350px)] overflow-auto p-4 md:p-6">
          {workspaces === undefined ? (
            <div className="kb-label">Loading workspaces...</div>
          ) : filteredWorkspaces.length === 0 ? (
            <div className="kb-panel p-6 text-sm text-muted-foreground">
              {workspaces.length === 0
                ? "No workspaces yet. Create one to start."
                : "No workspaces match your filters."}
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredWorkspaces.map((workspace, index) => (
                <article
                  key={workspace._id}
                  role="button"
                  tabIndex={0}
                  className="kb-panel kb-anim group cursor-pointer p-4 transition hover:border-primary/65 hover:bg-accent/45"
                  style={{ animationDelay: `${index * 35}ms` }}
                  onClick={() => router.push(`/workspace/${workspace._id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/workspace/${workspace._id}`);
                    }
                  }}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="border border-primary/45 bg-primary/15 p-2 text-primary">
                        <FolderKanban className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold tracking-[0.03em]">{workspace.name}</h2>
                        <div className="kb-label mt-1">{workspace.role ?? "member"}</div>
                      </div>
                    </div>
                    {workspace.role === "owner" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDelete(workspace._id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <p className="line-clamp-3 min-h-[60px] text-sm text-muted-foreground">
                    {workspace.docs || "No project docs yet."}
                  </p>

                  <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-3">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>Created: {formatDate(workspace.createdAt)}</div>
                      <div>Updated: {formatDate(workspace.updatedAt ?? workspace.createdAt)}</div>
                    </div>
                    <Button variant="outline" size="sm" className="group/cta">
                      Open
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/cta:translate-x-0.5" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="kb-panel overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-card/70">
                    <th className="px-4 py-3 text-left kb-label">Workspace</th>
                    <th className="px-4 py-3 text-left kb-label">Docs</th>
                    <th className="px-4 py-3 text-left kb-label">Role</th>
                    <th className="px-4 py-3 text-left kb-label">Created</th>
                    <th className="px-4 py-3 text-left kb-label">Updated</th>
                    <th className="px-4 py-3 text-right kb-label">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkspaces.map((workspace) => (
                    <tr
                      key={workspace._id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer border-b border-border/60 hover:bg-accent/30"
                      onClick={() => router.push(`/workspace/${workspace._id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/workspace/${workspace._id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-medium">{workspace.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {workspace.docs
                          ? workspace.docs.slice(0, 90) + (workspace.docs.length > 90 ? "..." : "")
                          : "No docs"}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{workspace.role}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(workspace.createdAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(workspace.updatedAt ?? workspace.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/workspace/${workspace._id}`);
                            }}
                          >
                            Open
                          </Button>
                          {workspace.role === "owner" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
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
        </section>
      </div>
    </main>
  );
}
