"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useWorkspaceData } from "@/components/workspace-data-provider";
import { useSession } from "@/lib/auth-client";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Pencil, Trash2, X } from "lucide-react";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function OracleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as Id<"workspaces">;
  const slug = params.slug as string;
  const { data: session, isPending: isSessionPending } = useSession();
  const { workspace } = useWorkspaceData();
  const oracle = useQuery(api.oracles.getBySlug, { workspaceId, slug });
  const updateOracle = useMutation(api.oracles.update);
  const removeOracle = useMutation(api.oracles.remove);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const oraclesListHref = `/workspace/${workspaceId}/oracles`;
  useEffect(() => {
    router.prefetch(oraclesListHref);
  }, [oraclesListHref, router]);

  useEffect(() => {
    if (oracle && !isEditing) {
      setEditName(oracle.name);
      setEditDescription(oracle.description);
      setEditContent(oracle.content);
    }
  }, [oracle, isEditing]);

  if (isSessionPending) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="kb-label">Loading...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="kb-label">Sign in to access oracles</div>
      </div>
    );
  }

  if (oracle === undefined) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <header className="flex h-16 items-center border-b-2 border-b-border bg-card px-7">
          <div className="h-6 w-48 animate-pulse bg-muted" />
        </header>
        <div className="flex-1 p-7">
          <div className="h-8 w-64 animate-pulse bg-muted" />
          <div className="mt-4 h-4 w-full animate-pulse bg-muted" />
          <div className="mt-2 h-4 w-3/4 animate-pulse bg-muted" />
        </div>
      </div>
    );
  }

  if (oracle === null) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4">
        <div className="kb-label">Oracle not found</div>
        <Link
          href={`/workspace/${workspaceId}/oracles`}
          className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
        >
          Back to Oracles
        </Link>
      </div>
    );
  }

  const startEditing = () => {
    setEditName(oracle.name);
    setEditDescription(oracle.description);
    setEditContent(oracle.content);
    setEditError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditError(null);
  };

  const handleSave = async () => {
    setEditError(null);
    setIsSaving(true);
    try {
      await updateOracle({
        id: oracle._id,
        name: editName,
        description: editDescription,
        content: editContent,
      });
      setIsEditing(false);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Failed to save"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeOracle({ id: oracle._id });
      router.push(`/workspace/${workspaceId}/oracles`);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Failed to delete"
      );
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b-2 border-b-border bg-card pl-12 pr-4 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/workspace/${workspaceId}/oracles`}
            className="text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/60 md:inline">
            {workspace?.name}
          </span>
          <span className="hidden text-muted-foreground/30 md:inline">/</span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/60 md:inline">
            Oracles
          </span>
          <span className="hidden text-muted-foreground/30 md:inline">/</span>
          <span className="font-mono text-[11px] font-bold text-primary">
            {oracle.slug}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="border border-primary bg-primary px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Discard
              </button>
            </>
          )}
        </div>
      </header>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="border-b-2 border-b-destructive bg-card/70 px-4 py-4 md:px-7">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-destructive">
                Delete this oracle?
              </span>
              <p className="mt-1 text-[12px] text-muted-foreground">
                This will permanently remove &quot;{oracle.name}&quot; and
                cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="border border-destructive bg-destructive px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition hover:bg-destructive/90 disabled:opacity-40"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t-2 border-t-primary">
        <div className="mx-auto max-w-4xl p-5 md:p-7">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="kb-label mb-1 block">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 w-full border border-border bg-background px-3 font-sans text-[16px] font-medium text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="kb-label mb-1 block">
                  Slug{" "}
                  <span className="text-muted-foreground/50">(read-only)</span>
                </label>
                <div className="h-9 w-full border border-border/50 bg-muted/30 px-3 py-2 font-mono text-[12px] text-primary/70">
                  {oracle.slug}
                </div>
              </div>

              <div>
                <label className="kb-label mb-1 block">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="h-8 w-full border border-border bg-background px-2.5 font-mono text-[12px] text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="kb-label mb-1 block">Content</label>
                <div className="grid gap-0 md:grid-cols-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={20}
                    className="w-full border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/50"
                  />
                  <div className="border border-border border-l-0 bg-background/50 p-3 hidden md:block">
                    <Markdown
                      content={editContent || "*Preview will appear here*"}
                      className="prose-sm"
                    />
                  </div>
                </div>
              </div>

              {editError && (
                <div className="font-mono text-[10px] text-destructive">
                  {editError}
                </div>
              )}
            </div>
          ) : (
            <div className="kb-anim">
              {/* Name + slug */}
              <h1 className="font-sans text-[24px] font-semibold tracking-[0.02em] text-foreground md:text-[30px]">
                {oracle.name}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="kb-chip">{oracle.slug}</span>
              </div>

              {/* Description */}
              {oracle.description && (
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                  {oracle.description}
                </p>
              )}

              {/* Metadata */}
              <div className="mt-4 flex items-center gap-4 border-b border-border pb-4">
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/60">
                  Updated {timeAgo(oracle.updatedAt)}
                  {oracle.updatedBy && ` by ${oracle.updatedBy}`}
                </span>
                {oracle.createdBy && oracle.createdBy !== oracle.updatedBy && (
                  <>
                    <span className="text-muted-foreground/30">|</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/60">
                      Created by {oracle.createdBy}
                    </span>
                  </>
                )}
              </div>

              {/* Content */}
              <div className="mt-5">
                {oracle.content ? (
                  <Markdown content={oracle.content} />
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No content yet. Click Edit to add content.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="flex h-7 items-center justify-between border-t border-border bg-card px-4 md:px-7">
        <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground/50">
          ORACLE://{oracle.slug}
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground/50">
          {isEditing ? "Editing" : "Read-only"}
        </span>
      </footer>
    </div>
  );
}
