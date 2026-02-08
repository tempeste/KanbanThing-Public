import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const syncFromAuth = mutation({
  args: {
    betterAuthUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Unauthorized");
    }

    if (authUser._id !== args.betterAuthUserId) {
      throw new Error("Unauthorized");
    }

    const email = authUser.email ?? args.email;
    if (!email) {
      throw new Error("Email is required");
    }

    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_betterAuthUserId", (q) =>
        q.eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();

    const normalizedEmail = email.toLowerCase();
    const name = authUser.name ?? args.name;
    const image = authUser.image ?? args.image;

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: normalizedEmail,
        name,
        image,
        lastSyncedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("userProfiles", {
      betterAuthUserId: args.betterAuthUserId,
      email: normalizedEmail,
      name,
      image,
      lastSyncedAt: Date.now(),
    });
  },
});

export const syncFromAuthIds = mutation({
  args: { betterAuthUserIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const authUser = await authComponent.getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Unauthorized");
    }

    const uniqueIds = Array.from(new Set(args.betterAuthUserIds)).filter(Boolean);
    if (uniqueIds.length > 100) {
      throw new Error("Too many user IDs");
    }

    const callerMemberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("betterAuthUserId", authUser._id))
      .collect();
    const allowedUserIds = new Set<string>([authUser._id]);

    for (const membership of callerMemberships) {
      const workspaceMembers = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", membership.workspaceId))
        .collect();

      for (const workspaceMember of workspaceMembers) {
        allowedUserIds.add(workspaceMember.betterAuthUserId);
      }
    }

    for (const id of uniqueIds) {
      if (!allowedUserIds.has(id)) {
        throw new Error("Unauthorized");
      }
    }

    let synced = 0;
    const missing: string[] = [];

    for (const id of uniqueIds) {
      const authUser = await authComponent.getAnyUserById(ctx, id);
      if (!authUser || !authUser.email) {
        missing.push(id);
        continue;
      }

      const normalizedEmail = authUser.email.toLowerCase();
      const existing = await ctx.db
        .query("userProfiles")
        .withIndex("by_betterAuthUserId", (q) =>
          q.eq("betterAuthUserId", id)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          email: normalizedEmail,
          name: authUser.name ?? undefined,
          image: authUser.image ?? undefined,
          lastSyncedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("userProfiles", {
          betterAuthUserId: id,
          email: normalizedEmail,
          name: authUser.name ?? undefined,
          image: authUser.image ?? undefined,
          lastSyncedAt: Date.now(),
        });
      }

      synced += 1;
    }

    return { synced, missing };
  },
});

export const getByAuthId = query({
  args: { betterAuthUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_betterAuthUserId", (q) =>
        q.eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();
  },
});

export const getByAuthIds = query({
  args: { betterAuthUserIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const profiles = await Promise.all(
      args.betterAuthUserIds.map((id) =>
        ctx.db
          .query("userProfiles")
          .withIndex("by_betterAuthUserId", (q) =>
            q.eq("betterAuthUserId", id)
          )
          .first()
      )
    );
    return profiles.filter(
      (p): p is NonNullable<typeof p> => p !== null
    );
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
  },
});

export const getByEmails = query({
  args: { emails: v.array(v.string()) },
  handler: async (ctx, args) => {
    const profiles = await Promise.all(
      args.emails.map((email) =>
        ctx.db
          .query("userProfiles")
          .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
          .first()
      )
    );
    return profiles.filter(
      (p): p is NonNullable<typeof p> => p !== null
    );
  },
});
