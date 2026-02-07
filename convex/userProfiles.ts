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
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_betterAuthUserId", (q) =>
        q.eq("betterAuthUserId", args.betterAuthUserId)
      )
      .first();

    const normalizedEmail = args.email.toLowerCase();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: normalizedEmail,
        name: args.name,
        image: args.image,
        lastSyncedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("userProfiles", {
      betterAuthUserId: args.betterAuthUserId,
      email: normalizedEmail,
      name: args.name,
      image: args.image,
      lastSyncedAt: Date.now(),
    });
  },
});

export const syncFromAuthIds = mutation({
  args: { betterAuthUserIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const uniqueIds = Array.from(new Set(args.betterAuthUserIds)).filter(Boolean);
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
