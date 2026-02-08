import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ArchivedBadge() {
  return (
    <Badge
      variant="secondary"
      className="gap-1 border-amber-500/40 bg-amber-500/12 text-amber-300"
    >
      <Archive className="h-3 w-3" />
      Archived
    </Badge>
  );
}
