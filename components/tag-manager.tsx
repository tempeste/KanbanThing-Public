"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useWorkspaceData } from "@/components/workspace-data-provider";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface TagManagerProps {
  workspaceId: Id<"workspaces">;
}

export function TagManager({ workspaceId }: TagManagerProps) {
  const { tags } = useWorkspaceData();
  const createTag = useMutation(api.tags.create);
  const updateTag = useMutation(api.tags.update);
  const removeTag = useMutation(api.tags.remove);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[4]);
  const [editingId, setEditingId] = useState<Id<"workspaceTags"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [error, setError] = useState("");

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setError("");
    try {
      await createTag({ workspaceId, name, color: newColor });
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    }
  };

  const startEdit = (tag: { _id: Id<"workspaceTags">; name: string; color: string }) => {
    setEditingId(tag._id);
    setEditName(tag.name);
    setEditColor(tag.color);
    setError("");
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setError("");
    try {
      await updateTag({ id: editingId, name: editName.trim(), color: editColor });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tag");
    }
  };

  const handleDelete = async (id: Id<"workspaceTags">) => {
    setError("");
    try {
      await removeTag({ id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tag");
    }
  };

  if (!tags) return <div className="kb-label">Loading tags...</div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {tags.map((tag) => (
          <div key={tag._id} className="flex items-center gap-2 border border-border bg-card/50 px-3 py-2">
            {editingId === tag._id ? (
              <>
                <div className="flex gap-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`h-4 w-4 rounded-full border-2 ${editColor === c ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                  className="flex-1 border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary/50"
                  autoFocus
                />
                <button type="button" onClick={handleUpdate} className="text-done hover:text-foreground">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                  {tag.name}
                </span>
                <button type="button" onClick={() => startEdit(tag)} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => handleDelete(tag._id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ))}

        {tags.length === 0 && (
          <div className="py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
            No tags yet
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border border-dashed border-border px-3 py-2">
        <div className="flex gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              className={`h-4 w-4 rounded-full border-2 ${newColor === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New tag name..."
          className="flex-1 border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition hover:border-muted-foreground/50 hover:text-foreground disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}
