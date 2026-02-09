import { Id } from "@/convex/_generated/dataModel";
import { TicketStatus, TicketSummary } from "@/lib/ticket-summary";

const STATUSES: TicketStatus[] = ["unclaimed", "in_progress", "done"];

export const getTicketOrderValue = (ticket: Pick<TicketSummary, "order" | "createdAt">) =>
  ticket.order ?? ticket.createdAt;

const hasArchivedAncestor = (
  ticket: TicketSummary,
  ticketById: Map<Id<"tickets">, TicketSummary>
) => {
  let currentParentId = ticket.parentId ?? null;
  while (currentParentId) {
    const parent = ticketById.get(currentParentId);
    if (!parent) return false;
    if (parent.archived ?? false) return true;
    currentParentId = parent.parentId ?? null;
  }
  return false;
};

export const deriveVisibleTickets = (
  tickets: TicketSummary[],
  showArchived: boolean
) => {
  if (showArchived) return tickets;

  const ticketById = new Map(tickets.map((ticket) => [ticket._id, ticket]));
  return tickets.filter(
    (ticket) => !(ticket.archived ?? false) && !hasArchivedAncestor(ticket, ticketById)
  );
};

export const deriveChildrenByParent = (tickets: TicketSummary[]) => {
  const visibleById = new Map(tickets.map((ticket) => [ticket._id, ticket]));
  const childrenByParent = new Map<Id<"tickets"> | "root", TicketSummary[]>();

  for (const ticket of tickets) {
    const hasVisibleParent = ticket.parentId ? visibleById.has(ticket.parentId) : false;
    const parentKey = hasVisibleParent ? ticket.parentId! : "root";
    const siblings = childrenByParent.get(parentKey) ?? [];
    siblings.push(ticket);
    childrenByParent.set(parentKey, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => getTicketOrderValue(a) - getTicketOrderValue(b));
  }

  return childrenByParent;
};

export const deriveTicketsByStatus = (tickets: TicketSummary[]) => {
  const grouped = Object.fromEntries(
    STATUSES.map((status) => [status, [] as TicketSummary[]])
  ) as Record<TicketStatus, TicketSummary[]>;

  for (const ticket of tickets) {
    grouped[ticket.status].push(ticket);
  }

  for (const status of STATUSES) {
    grouped[status].sort((a, b) => getTicketOrderValue(a) - getTicketOrderValue(b));
  }

  return grouped;
};

export type SortColumn = "number" | "title" | "assignee" | "status";
export type SortDirection = "asc" | "desc";

const STATUS_ORDER: Record<TicketStatus, number> = {
  unclaimed: 0,
  in_progress: 1,
  done: 2,
};

export const deriveSortedFlatRows = (
  tickets: TicketSummary[],
  col: SortColumn,
  dir: SortDirection
): Array<{ ticket: TicketSummary; depth: number }> => {
  const sorted = [...tickets].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case "number":
        cmp = (a.number ?? 0) - (b.number ?? 0);
        break;
      case "title":
        cmp = (a.title ?? "").localeCompare(b.title ?? "", undefined, {
          sensitivity: "base",
        });
        break;
      case "assignee": {
        const aName = a.ownerDisplayName ?? "";
        const bName = b.ownerDisplayName ?? "";
        if (!aName && bName) return 1;
        if (aName && !bName) return -1;
        cmp = aName.localeCompare(bName, undefined, { sensitivity: "base" });
        break;
      }
      case "status":
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        break;
    }
    return dir === "desc" ? -cmp : cmp;
  });
  return sorted.map((ticket) => ({ ticket, depth: 0 }));
};

export const deriveTreeRows = (
  childrenByParent: Map<Id<"tickets"> | "root", TicketSummary[]>,
  collapsed: ReadonlySet<string>
) => {
  const rows: Array<{ ticket: TicketSummary; depth: number }> = [];

  const visit = (ticket: TicketSummary, depth: number) => {
    rows.push({ ticket, depth });
    if (collapsed.has(ticket._id)) return;
    const children = childrenByParent.get(ticket._id) ?? [];
    for (const child of children) {
      visit(child, depth + 1);
    }
  };

  for (const root of childrenByParent.get("root") ?? []) {
    visit(root, 0);
  }

  return rows;
};
