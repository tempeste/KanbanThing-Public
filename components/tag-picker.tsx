"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { ChevronDown, Tag } from "lucide-react";

interface TagPickerProps {
  workspaceId: Id<"workspaces">;
  ticketId: Id<"tickets">;
  currentTags: Id<"workspaceTags">[];
}

export function TagPicker({ workspaceId, ticketId, currentTags }: TagPickerProps) {
  const tags = useQuery(api.tags.list, { workspaceId });
  const updateTicket = useMutation(api.tickets.update);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Optimistic local state so rapid clicks don't clobber each other
  const [localTags, setLocalTags] = useState(currentTags);
  const localTagsRef = useRef(localTags);
  localTagsRef.current = localTags;
  const pendingRef = useRef(0);
  const serverTagsRef = useRef(currentTags);

  useEffect(() => {
    serverTagsRef.current = currentTags;
    if (pendingRef.current === 0) {
      setLocalTags(currentTags);
      localTagsRef.current = currentTags;
    }
  }, [currentTags]);

  const toggleTag = useCallback(
    (tagId: Id<"workspaceTags">) => {
      const current = localTagsRef.current;
      const next = current.includes(tagId)
        ? current.filter((t) => t !== tagId)
        : [...current, tagId];
      setLocalTags(next);
      localTagsRef.current = next;
      pendingRef.current++;
      updateTicket({ id: ticketId, tags: next }).finally(() => {
        pendingRef.current--;
        if (pendingRef.current === 0) {
          setLocalTags(serverTagsRef.current);
          localTagsRef.current = serverTagsRef.current;
        }
      });
    },
    [ticketId, updateTicket]
  );

  if (!tags) return null;

  const selectedTags = tags.filter((t) => localTags.includes(t._id));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 border border-border bg-card/50 px-3 py-2 text-left transition hover:bg-accent"
      >
        <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
        {selectedTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selectedTags.map((tag) => (
              <span
                key={tag._id}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground/60">Add tags...</span>
        )}
        <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 w-full min-w-[180px] border border-border bg-card shadow-lg">
            {tags.length === 0 ? (
              <div className="px-3 py-2 font-mono text-[10px] text-muted-foreground/60">
                No tags — create some in Settings
              </div>
            ) : (
              tags.map((tag) => {
                const checked = localTags.includes(tag._id);
                return (
                  <button
                    key={tag._id}
                    type="button"
                    onClick={() => toggleTag(tag._id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="h-3 w-3 accent-primary"
                    />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground">
                      {tag.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function TagPills({
  tags,
  workspaceTags,
}: {
  tags: Id<"workspaceTags">[] | undefined;
  workspaceTags: Doc<"workspaceTags">[] | undefined;
}) {
  if (!tags?.length || !workspaceTags?.length) return null;
  const tagMap = new Map(workspaceTags.map((t) => [t._id, t]));

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tagId) => {
        const tag = tagMap.get(tagId);
        if (!tag) return null;
        return (
          <span
            key={tagId}
            className="inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
          </span>
        );
      })}
    </div>
  );
}
