import { Archive } from "lucide-react";

export function ArchivedBanner() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
      <Archive className="h-4 w-4 shrink-0" />
      <span>This issue is archived and is no longer active.</span>
    </div>
  );
}
