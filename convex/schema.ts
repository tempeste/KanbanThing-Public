import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    docs: v.optional(v.string()),
    prefix: v.optional(v.string()),
    ticketCounter: v.optional(v.number()),
    createdBy: v.optional(v.string()), // Better Auth user ID
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    betterAuthUserId: v.string(), // References Better Auth's user.id
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["betterAuthUserId"])
    .index("by_workspace_user", ["workspaceId", "betterAuthUserId"]),

  userProfiles: defineTable({
    betterAuthUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    lastSyncedAt: v.number(),
  })
    .index("by_betterAuthUserId", ["betterAuthUserId"])
    .index("by_email", ["email"]),

  tickets: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.string(),
    number: v.optional(v.number()),
    parentId: v.union(v.id("tickets"), v.null()),
    order: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    status: v.union(
      v.literal("backlog"),
      v.literal("unclaimed"),
      v.literal("dispatched"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    childCount: v.number(),
    childDoneCount: v.number(),
    priority: v.optional(v.union(
      v.literal("none"),
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    )),
    ownerId: v.optional(v.string()),
    ownerType: v.optional(v.union(v.literal("user"), v.literal("agent"))),
    ownerDisplayName: v.optional(v.string()), // Cached display name for UI
    lastDispatchRunId: v.optional(v.string()),
    lastDispatchInstanceId: v.optional(v.id("openclawInstances")),
    lastDispatchInstanceName: v.optional(v.string()),
    lastDispatchUserId: v.optional(v.string()),
    lastDispatchUserDisplayName: v.optional(v.string()),
    lastDispatchAt: v.optional(v.number()),
    tags: v.optional(v.array(v.id("workspaceTags"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_parent", ["workspaceId", "parentId"])
    .index("by_workspace_parent_status", ["workspaceId", "parentId", "status"]),

  apiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    keyHash: v.string(),
    name: v.string(),
    role: v.optional(v.union(v.literal("admin"), v.literal("agent"))),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_keyHash", ["keyHash"]),

  ticketComments: defineTable({
    workspaceId: v.id("workspaces"),
    ticketId: v.id("tickets"),
    body: v.string(),
    authorType: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    authorId: v.string(),
    authorDisplayName: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_ticket_createdAt", ["ticketId", "createdAt"]),

  ticketActivities: defineTable({
    workspaceId: v.id("workspaces"),
    ticketId: v.id("tickets"),
    type: v.string(),
    actorType: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    data: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_ticket_createdAt", ["ticketId", "createdAt"]),

  dispatchExecutions: defineTable({
    workspaceId: v.id("workspaces"),
    dispatchId: v.string(),
    runId: v.optional(v.string()),
    state: v.string(),
    ticketIds: v.array(v.id("tickets")),
    protocolVersion: v.optional(v.number()),
    lastEventType: v.string(),
    lastEventId: v.optional(v.string()),
    lastMessage: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    ackAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    cancelRequestedAt: v.optional(v.number()),
    cancelAckAt: v.optional(v.number()),
    cancelResultAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    timedOutAt: v.optional(v.number()),
    lastHeartbeatAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_dispatch", ["workspaceId", "dispatchId"]),

  dispatchProtocolEventReceipts: defineTable({
    workspaceId: v.id("workspaces"),
    eventId: v.string(),
    eventType: v.string(),
    dispatchId: v.optional(v.string()),
    runId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_workspace_event", ["workspaceId", "eventId"]),

  workspaceTags: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    color: v.string(),
    order: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  workspaceDocsVersions: defineTable({
    workspaceId: v.id("workspaces"),
    docs: v.string(),
    actorType: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_workspace_createdAt", ["workspaceId", "createdAt"]),

  openclawInstances: defineTable({
    userId: v.string(),
    name: v.string(),
    url: v.string(),
    integrationMode: v.optional(v.union(v.literal("basic"), v.literal("enhanced"))),
    encryptedToken: v.object({
      nonce: v.string(),
      ciphertext: v.string(),
    }),
    tokenSyncStatus: v.optional(
      v.union(
        v.literal("unknown"),
        v.literal("token_rotation_pending"),
        v.literal("healthy"),
        v.literal("auth_failed")
      )
    ),
    tokenRotatedAt: v.optional(v.number()),
    tokenVerifiedAt: v.optional(v.number()),
    tokenLastVerifyError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"]),
});
