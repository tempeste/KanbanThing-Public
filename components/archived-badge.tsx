import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ArchivedBadge() {
  return (
    <Badge
      variant="secondary"
      className="gap-1 bg-amber-100 text-amber-700 border-amber-300/50 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/50"
    >
      <Archive className="h-3 w-3" />
      Archived
    </Badge>
  );
}
