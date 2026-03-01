"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePrefetch } from "@/lib/use-prefetch";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useWorkspaceData } from "@/components/workspace-data-provider";
import { useSession } from "@/lib/auth-client";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Plus, X } from "lucide-react";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

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

export default function OraclesPage() {
  const params = useParams();
  const workspaceId = params.id as Id<"workspaces">;
  const { data: session, isPending: isSessionPending } = useSession();
  const { workspace } = useWorkspaceData();
  const oracles = useQuery(api.oracles.list, { workspaceId });
  const createOracle = useMutation(api.oracles.create);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formSlugManual, setFormSlugManual] = useState(false);
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const prefetch = usePrefetch();

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

  const handleNameChange = (value: string) => {
    setFormName(value);
    if (!formSlugManual) {
      setFormSlug(slugify(value));
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormSlug("");
    setFormSlugManual(false);
    setFormDescription("");
    setFormContent("");
    setFormError(null);
    setShowCreateForm(false);
    setShowPreview(false);
  };

  const handleCreate = async () => {
    setFormError(null);
    setIsCreating(true);
    try {
      await createOracle({
        workspaceId,
        slug: formSlug,
        name: formName,
        description: formDescription,
        content: formContent,
      });
      resetForm();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to create oracle"
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b-2 border-b-border bg-card pl-12 pr-4 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/workspace/${workspaceId}`}
            className="text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="truncate font-sans text-[22px] font-semibold tracking-[0.04em] text-foreground md:text-[30px]">
            ORACLES
          </h1>
          <span className="hidden font-mono text-[11px] text-muted-foreground/70 md:inline">
            {oracles ? `${oracles.length} FILES` : "..."}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="kb-label hidden md:inline">
            {workspace?.name ?? ""}
          </span>
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="ml-2 inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground/80"
          >
            <Plus className="h-3 w-3" />
            New Oracle
          </button>
        </div>
      </header>

      {/* Create form */}
      {showCreateForm && (
        <div className="border-b-2 border-b-primary bg-card/70 px-4 py-5 md:px-7">
          <div className="flex items-center justify-between">
            <span className="kb-label">Create Oracle</span>
            <button
              type="button"
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="kb-label mb-1 block">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Frontend Payments"
                className="h-8 w-full border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="kb-label mb-1 block">Slug</label>
              <input
                type="text"
                value={formSlug}
                onChange={(e) => {
                  setFormSlugManual(true);
                  setFormSlug(e.target.value);
                }}
                placeholder="frontend-payments"
                className="h-8 w-full border border-border bg-background px-2.5 font-mono text-[12px] text-primary placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="kb-label mb-1 block">Description</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Short summary for agents to decide relevance"
              className="h-8 w-full border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
            />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="kb-label">Content</label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
              >
                {showPreview ? "Editor" : "Preview"}
              </button>
            </div>
            {showPreview ? (
              <div className="min-h-[120px] border border-border bg-background p-3">
                <Markdown content={formContent || "*No content yet*"} />
              </div>
            ) : (
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="# Oracle content (markdown)"
                rows={5}
                className="w-full border border-border bg-background px-2.5 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
              />
            )}
          </div>

          {formError && (
            <div className="mt-2 font-mono text-[10px] text-destructive">
              {formError}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || !formName.trim() || !formSlug.trim()}
              className="border border-primary bg-primary px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="border border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Oracle list */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t-2 border-t-primary">
        {oracles === undefined ? (
          <div className="space-y-px p-3 md:p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-border bg-card p-4">
                <div className="h-3 w-32 animate-pulse bg-muted" />
                <div className="mt-2 h-4 w-64 animate-pulse bg-muted" />
                <div className="mt-2 h-3 w-full animate-pulse bg-muted" />
              </div>
            ))}
          </div>
        ) : oracles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="kb-label">No oracles yet</div>
            <p className="max-w-md text-sm text-muted-foreground">
              Oracles are per-functional-area living docs that give agents
              scoped context, rules, and lessons learned.
            </p>
            {!showCreateForm && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-1 border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Create your first oracle
              </button>
            )}
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-3 p-3 md:grid-cols-2 md:p-5 xl:grid-cols-3">
            {oracles.map((oracle, i) => (
              <Link
                key={oracle._id}
                href={`/workspace/${workspaceId}/oracles/${oracle.slug}`}
                onMouseEnter={() => prefetch(`/workspace/${workspaceId}/oracles/${oracle.slug}`, [
                  { query: api.oracles.getBySlug, args: { workspaceId, slug: oracle.slug } },
                ])}
                className="kb-anim group flex flex-col border border-border bg-card/55 p-4 transition hover:border-foreground/35 hover:bg-card/80"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="font-mono text-[11px] font-bold text-primary">
                  {oracle.slug}
                </span>
                <span className="mt-1.5 font-sans text-[14px] font-medium leading-snug text-foreground">
                  {oracle.name}
                </span>
                {oracle.description && (
                  <span className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                    {oracle.description}
                  </span>
                )}
                <span className="mt-auto flex items-center gap-2 pt-3 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/50">
                  <span>{timeAgo(oracle.updatedAt)}</span>
                  {oracle.updatedBy && (
                    <span>by {oracle.updatedBy}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex h-7 items-center justify-between border-t border-border bg-card px-4 md:px-7">
        <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground/50">
          ORACLES://{workspace?.prefix ?? "..."}
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground/50">
          {oracles ? `${oracles.length} files` : "..."}
        </span>
      </footer>
    </div>
  );
}
