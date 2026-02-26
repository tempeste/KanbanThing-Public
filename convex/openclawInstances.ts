import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { authComponent, getAuthUserOrNull } from "./auth";
import { getOpenClawInstanceUrlValidationError } from "../lib/openclaw-instance-validation";

const encryptedTokenValidator = v.object({
  nonce: v.string(),
  ciphertext: v.string(),
});

type TokenVerificationStatus = "unknown" | "token_rotation_pending" | "healthy" | "auth_failed";
type VerificationMode = "basic" | "enhanced";

const getModeScopedVerificationState = (
  instance: Doc<"openclawInstances">,
  mode: VerificationMode
) => {
  const hasLegacyEnhanced404FailureAfterPriorSuccess =
    instance.basicTokenSyncStatus === undefined &&
    instance.tokenSyncStatus === "auth_failed" &&
    typeof instance.tokenVerifiedAt === "number" &&
    typeof instance.tokenLastVerifyError === "string" &&
    instance.tokenLastVerifyError.includes("404");

  if (mode === "enhanced") {
    if (instance.enhancedTokenSyncStatus !== undefined) {
      return {
        tokenSyncStatus: instance.enhancedTokenSyncStatus,
        tokenVerifiedAt: instance.enhancedTokenVerifiedAt,
        tokenLastVerifyError: instance.enhancedTokenLastVerifyError,
      };
    }
    return {
      tokenSyncStatus: instance.enhancedTokenSyncStatus ?? instance.tokenSyncStatus ?? "unknown",
      tokenVerifiedAt: instance.enhancedTokenVerifiedAt ?? instance.tokenVerifiedAt,
      tokenLastVerifyError:
        instance.enhancedTokenLastVerifyError ?? instance.tokenLastVerifyError,
    };
  }
  if (hasLegacyEnhanced404FailureAfterPriorSuccess) {
    return {
      tokenSyncStatus: "healthy" as const,
      tokenVerifiedAt: instance.tokenVerifiedAt,
      tokenLastVerifyError: undefined,
    };
  }
  if (instance.basicTokenSyncStatus !== undefined) {
    return {
      tokenSyncStatus: instance.basicTokenSyncStatus,
      tokenVerifiedAt: instance.basicTokenVerifiedAt,
      tokenLastVerifyError: instance.basicTokenLastVerifyError,
    };
  }
  return {
    tokenSyncStatus: instance.basicTokenSyncStatus ?? instance.tokenSyncStatus ?? "unknown",
    tokenVerifiedAt: instance.basicTokenVerifiedAt ?? instance.tokenVerifiedAt,
    tokenLastVerifyError: instance.basicTokenLastVerifyError ?? instance.tokenLastVerifyError,
  };
};

const applyScopedVerificationState = (
  updates: {
    basicTokenSyncStatus?: TokenVerificationStatus;
    basicTokenVerifiedAt?: number;
    basicTokenLastVerifyError?: string;
    enhancedTokenSyncStatus?: TokenVerificationStatus;
    enhancedTokenVerifiedAt?: number;
    enhancedTokenLastVerifyError?: string;
  },
  args: {
    mode: VerificationMode;
    tokenSyncStatus: TokenVerificationStatus;
    tokenVerifiedAt?: number;
    tokenLastVerifyError?: string;
  }
) => {
  if (args.mode === "enhanced") {
    updates.enhancedTokenSyncStatus = args.tokenSyncStatus;
    updates.enhancedTokenVerifiedAt = args.tokenVerifiedAt;
    updates.enhancedTokenLastVerifyError = args.tokenLastVerifyError;
    return;
  }
  updates.basicTokenSyncStatus = args.tokenSyncStatus;
  updates.basicTokenVerifiedAt = args.tokenVerifiedAt;
  updates.basicTokenLastVerifyError = args.tokenLastVerifyError;
};

const invalidateAllVerificationStates = (
  updates: {
    tokenSyncStatus?: TokenVerificationStatus;
    tokenVerifiedAt?: number;
    tokenLastVerifyError?: string;
    basicTokenSyncStatus?: TokenVerificationStatus;
    basicTokenVerifiedAt?: number;
    basicTokenLastVerifyError?: string;
    enhancedTokenSyncStatus?: TokenVerificationStatus;
    enhancedTokenVerifiedAt?: number;
    enhancedTokenLastVerifyError?: string;
  },
  status: TokenVerificationStatus
) => {
  updates.tokenSyncStatus = status;
  updates.tokenVerifiedAt = undefined;
  updates.tokenLastVerifyError = undefined;
  updates.basicTokenSyncStatus = status;
  updates.basicTokenVerifiedAt = undefined;
  updates.basicTokenLastVerifyError = undefined;
  updates.enhancedTokenSyncStatus = status;
  updates.enhancedTokenVerifiedAt = undefined;
  updates.enhancedTokenLastVerifyError = undefined;
};

const normalizeName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name is required");
  }
  if (trimmed.length > 120) {
    throw new Error("Name cannot exceed 120 characters");
  }
  return trimmed;
};

const normalizeUrl = (url: string, options?: { allowLocal?: boolean }) => {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("URL is required");
  }
  try {
    const urlError = getOpenClawInstanceUrlValidationError(trimmed, options);
    if (urlError) {
      throw new Error(urlError);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Invalid URL");
  }
  if (trimmed.length > 500) {
    throw new Error("URL cannot exceed 500 characters");
  }
  return trimmed;
};

type AuthCtx = QueryCtx | MutationCtx;

const requireAuthUserId = async (ctx: AuthCtx) => {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user._id;
};

const ensureNameUnique = async (
  ctx: MutationCtx,
  userId: string,
  normalizedName: string,
  excludeId?: Id<"openclawInstances">
) => {
  const existing = await ctx.db
    .query("openclawInstances")
    .withIndex("by_user_name", (q) =>
      q.eq("userId", userId).eq("name", normalizedName)
    )
    .first();

  if (existing && existing._id !== excludeId) {
    throw new Error("Instance name must be unique per user");
  }
};

export const getCurrentUserId = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await requireAuthUserId(ctx);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await getAuthUserOrNull(ctx);
    if (!authUser) {
      return [];
    }

    const userId = authUser._id;
    const instances = await ctx.db
      .query("openclawInstances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return instances.map((instance) => ({
      ...getModeScopedVerificationState(instance, instance.integrationMode ?? "basic"),
      _id: instance._id,
      name: instance.name,
      url: instance.url,
      integrationMode: instance.integrationMode ?? "basic",
      tokenRotatedAt: instance.tokenRotatedAt,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
    }));
  },
});

export const remove = mutation({
  args: {
    id: v.id("openclawInstances"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== userId) {
      throw new Error("Instance not found");
    }
    await ctx.db.delete(args.id);
  },
});

export const createEncrypted = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    url: v.string(),
    encryptedToken: encryptedTokenValidator,
    integrationMode: v.optional(v.union(v.literal("basic"), v.literal("enhanced"))),
    allowLocal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const url = normalizeUrl(args.url, { allowLocal: args.allowLocal });
    await ensureNameUnique(ctx, args.userId, name);

    const now = Date.now();
    return await ctx.db.insert("openclawInstances", {
      userId: args.userId,
      name,
      url,
      encryptedToken: args.encryptedToken,
      integrationMode: args.integrationMode ?? "basic",
      tokenSyncStatus: "token_rotation_pending",
      basicTokenSyncStatus: "token_rotation_pending",
      enhancedTokenSyncStatus: "token_rotation_pending",
      tokenRotatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEncrypted = internalMutation({
  args: {
    id: v.id("openclawInstances"),
    userId: v.string(),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    encryptedToken: v.optional(encryptedTokenValidator),
    integrationMode: v.optional(v.union(v.literal("basic"), v.literal("enhanced"))),
    allowLocal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== args.userId) {
      throw new Error("Instance not found");
    }
    let shouldInvalidateVerificationState = false;

    const updates: {
      name?: string;
      url?: string;
      encryptedToken?: { nonce: string; ciphertext: string };
      integrationMode?: "basic" | "enhanced";
      tokenSyncStatus?: TokenVerificationStatus;
      tokenRotatedAt?: number;
      tokenVerifiedAt?: number;
      tokenLastVerifyError?: string;
      basicTokenSyncStatus?: TokenVerificationStatus;
      basicTokenVerifiedAt?: number;
      basicTokenLastVerifyError?: string;
      enhancedTokenSyncStatus?: TokenVerificationStatus;
      enhancedTokenVerifiedAt?: number;
      enhancedTokenLastVerifyError?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      updates.name = normalizeName(args.name);
      await ensureNameUnique(ctx, args.userId, updates.name, args.id);
    }
    if (args.url !== undefined) {
      updates.url = normalizeUrl(args.url, { allowLocal: args.allowLocal });
      shouldInvalidateVerificationState ||= updates.url !== instance.url;
    }
    if (args.encryptedToken !== undefined) {
      updates.encryptedToken = args.encryptedToken;
      invalidateAllVerificationStates(updates, "token_rotation_pending");
      updates.tokenRotatedAt = Date.now();
    }
    if (args.integrationMode !== undefined) {
      updates.integrationMode = args.integrationMode;
    }

    if (shouldInvalidateVerificationState && args.encryptedToken === undefined) {
      invalidateAllVerificationStates(updates, "unknown");
    }

    await ctx.db.patch(args.id, updates);
  },
});

export const markTokenRotationPending = internalMutation({
  args: {
    id: v.id("openclawInstances"),
    userId: v.string(),
    encryptedToken: encryptedTokenValidator,
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== args.userId) {
      throw new Error("Instance not found");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      encryptedToken: args.encryptedToken,
      tokenSyncStatus: "token_rotation_pending",
      basicTokenSyncStatus: "token_rotation_pending",
      enhancedTokenSyncStatus: "token_rotation_pending",
      tokenRotatedAt: now,
      tokenLastVerifyError: undefined,
      tokenVerifiedAt: undefined,
      basicTokenVerifiedAt: undefined,
      basicTokenLastVerifyError: undefined,
      enhancedTokenVerifiedAt: undefined,
      enhancedTokenLastVerifyError: undefined,
      updatedAt: now,
    });
  },
});

export const markTokenHealthy = internalMutation({
  args: {
    id: v.id("openclawInstances"),
    userId: v.string(),
    mode: v.union(v.literal("basic"), v.literal("enhanced")),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== args.userId) {
      throw new Error("Instance not found");
    }
    const now = Date.now();
    const updates: {
      tokenSyncStatus: TokenVerificationStatus;
      tokenVerifiedAt: number;
      tokenLastVerifyError?: string;
      basicTokenSyncStatus?: TokenVerificationStatus;
      basicTokenVerifiedAt?: number;
      basicTokenLastVerifyError?: string;
      enhancedTokenSyncStatus?: TokenVerificationStatus;
      enhancedTokenVerifiedAt?: number;
      enhancedTokenLastVerifyError?: string;
      updatedAt: number;
    } = {
      tokenSyncStatus: "healthy",
      tokenVerifiedAt: now,
      tokenLastVerifyError: undefined,
      updatedAt: now,
    };
    applyScopedVerificationState(updates, {
      mode: args.mode,
      tokenSyncStatus: "healthy",
      tokenVerifiedAt: now,
      tokenLastVerifyError: undefined,
    });
    await ctx.db.patch(args.id, {
      ...updates,
    });
  },
});

export const markTokenVerifyFailed = internalMutation({
  args: {
    id: v.id("openclawInstances"),
    userId: v.string(),
    error: v.string(),
    mode: v.union(v.literal("basic"), v.literal("enhanced")),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== args.userId) {
      throw new Error("Instance not found");
    }
    const trimmedError = args.error.slice(0, 500);
    const updates: {
      tokenSyncStatus: TokenVerificationStatus;
      tokenLastVerifyError: string;
      basicTokenSyncStatus?: TokenVerificationStatus;
      basicTokenVerifiedAt?: number;
      basicTokenLastVerifyError?: string;
      enhancedTokenSyncStatus?: TokenVerificationStatus;
      enhancedTokenVerifiedAt?: number;
      enhancedTokenLastVerifyError?: string;
      updatedAt: number;
    } = {
      tokenSyncStatus: "auth_failed",
      tokenLastVerifyError: trimmedError,
      updatedAt: Date.now(),
    };
    applyScopedVerificationState(updates, {
      mode: args.mode,
      tokenSyncStatus: "auth_failed",
      tokenVerifiedAt: undefined,
      tokenLastVerifyError: trimmedError,
    });
    await ctx.db.patch(args.id, {
      ...updates,
    });
  },
});

export const getUserDisplayName = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await authComponent.getAnyUserById(ctx, args.userId);
    if (!user) return "Authenticated user";
    return user.name ?? user.email ?? "Authenticated user";
  },
});

export const getOwnedEncryptedForDispatch = internalQuery({
  args: {
    id: v.id("openclawInstances"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== args.userId) {
      return null;
    }
    return instance;
  },
});
