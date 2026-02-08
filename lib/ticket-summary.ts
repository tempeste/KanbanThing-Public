import { Doc } from "@/convex/_generated/dataModel";

export type TicketStatus = Doc<"tickets">["status"];

export type TicketSummary = Pick<
  Doc<"tickets">,
  | "_id"
  | "workspaceId"
  | "title"
  | "number"
  | "parentId"
  | "order"
  | "archived"
  | "status"
  | "childCount"
  | "childDoneCount"
  | "ownerId"
  | "ownerType"
  | "ownerDisplayName"
  | "createdAt"
  | "updatedAt"
>;
