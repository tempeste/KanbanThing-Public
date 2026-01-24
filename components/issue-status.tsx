"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock } from "lucide-react";

export const STATUS_META = {
  unclaimed: {
    label: "Unclaimed",
    Icon: Circle,
    colorClass: "bg-unclaimed/20 text-unclaimed",
  },
  in_progress: {
    label: "In Progress",
    Icon: Clock,
    colorClass: "bg-in-progress/20 text-in-progress",
  },
  done: {
    label: "Done",
    Icon: CheckCircle2,
    colorClass: "bg-done/20 text-done",
  },
} as const;

export type IssueStatus = keyof typeof STATUS_META;

type Size = "sm" | "md";

interface IssueStatusBadgeProps {
  status: IssueStatus;
  size?: Size;
  className?: string;
}

export function IssueStatusBadge({
  status,
  size = "sm",
  className,
}: IssueStatusBadgeProps) {
  const { Icon, label, colorClass } = STATUS_META[status];
  const iconClass = size === "md" ? "w-4 h-4" : "w-3 h-3";

  return (
    <Badge variant="outline" className={cn("gap-1", colorClass, className)}>
      <Icon className={iconClass} />
      {label}
    </Badge>
  );
}
