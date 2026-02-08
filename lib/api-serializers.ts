import { Doc } from "@/convex/_generated/dataModel";

type TicketSummary = Pick<
  Doc<"tickets">,
  | "_id"
  | "title"
  | "number"
  | "status"
  | "ownerId"
  | "ownerType"
  | "ownerDisplayName"
  | "parentId"
  | "order"
  | "archived"
  | "childCount"
  | "childDoneCount"
  | "createdAt"
  | "updatedAt"
>;

export const serializeTicket = (t: Doc<"tickets">) => ({
  id: t._id,
  title: t.title,
  description: t.description,
  number: t.number ?? null,
  status: t.status,
  ownerId: t.ownerId ?? null,
  ownerType: t.ownerType ?? null,
  ownerDisplayName: t.ownerDisplayName ?? null,
  parentId: t.parentId ?? null,
  order: t.order,
  archived: t.archived ?? false,
  childCount: t.childCount ?? 0,
  childDoneCount: t.childDoneCount ?? 0,
  hasChildren: (t.childCount ?? 0) > 0,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

export const serializeTicketSummary = (t: TicketSummary) => ({
  id: t._id,
  title: t.title,
  number: t.number ?? null,
  status: t.status,
  ownerId: t.ownerId ?? null,
  ownerType: t.ownerType ?? null,
  ownerDisplayName: t.ownerDisplayName ?? null,
  parentId: t.parentId ?? null,
  order: t.order,
  archived: t.archived ?? false,
  childCount: t.childCount ?? 0,
  childDoneCount: t.childDoneCount ?? 0,
  hasChildren: (t.childCount ?? 0) > 0,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});
