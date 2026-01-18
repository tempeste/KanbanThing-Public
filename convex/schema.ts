import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    docs: v.optional(v.string()),
    createdAt: v.number(),
  }),

  tickets: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.string(),
    docs: v.optional(v.string()),
    status: v.union(
      v.literal("unclaimed"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    ownerId: v.optional(v.string()),
    ownerType: v.optional(v.union(v.literal("user"), v.literal("agent"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  apiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    keyHash: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_keyHash", ["keyHash"]),
});
