export type TicketPriority = "none" | "low" | "medium" | "high" | "urgent";

export const PRIORITY_META: Record<
  TicketPriority,
  { label: string; shortLabel: string; color: string }
> = {
  urgent: { label: "Urgent", shortLabel: "P0", color: "#ef4444" },
  high: { label: "High", shortLabel: "P1", color: "#f97316" },
  medium: { label: "Medium", shortLabel: "P2", color: "#eab308" },
  low: { label: "Low", shortLabel: "P3", color: "#6b7280" },
  none: { label: "None", shortLabel: "—", color: "var(--muted-foreground)" },
};

export const PRIORITY_ORDER: TicketPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];
