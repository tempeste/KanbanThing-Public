import { Archive } from "lucide-react";

export function ArchivedBanner() {
  return (
    <div className="mb-4 flex items-center gap-2 border border-amber-500/45 bg-amber-500/12 px-4 py-3 text-sm text-amber-300">
      <Archive className="h-4 w-4 shrink-0" />
      <span>This issue is archived and is no longer active.</span>
    </div>
  );
}
