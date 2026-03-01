"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { encryptOpenClawToken } from "../lib/openclaw-crypto";
import { getOpenClawInstanceUrlValidationError } from "../lib/openclaw-instance-validation";

const getEncryptionKey = () => {
  const key = process.env.OPENCLAW_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("OPENCLAW_ENCRYPTION_KEY is not configured");
  }
  return key;
};

const generateOpenClawBearerToken = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "oc_";
  for (let i = 0; i < 40; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

const withPluginPath = (rawUrl: string, path: string) => {
  const normalized = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalized}${normalizedPath}`;
};

const verifyOpenClawBearerToken = async (args: { url: string; token: string }) => {
  const urlError = getOpenClawInstanceUrlValidationError(args.url);
  if (urlError) throw new Error(urlError);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(withPluginPath(args.url, "/kanbanthing/capabilities"), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${args.token}`,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const error = new Error(
        (json?.error as string | undefined) ??
          (json?.message as string | undefined) ??
          `Verification failed (${response.status})`
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
};

const callOpenClawPlugin = async (args: {
  url: string;
  token: string;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
}) => {
  const urlError = getOpenClawInstanceUrlValidationError(args.url);
  if (urlError) throw new Error(urlError);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(withPluginPath(args.url, args.path), {
      method: args.method,
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
      },
      ...(args.body ? { body: JSON.stringify(args.body) } : {}),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const error = new Error(
        (json?.message as string | undefined) ??
          (json?.error as string | undefined) ??
          `Plugin request failed (${response.status})`
      ) as Error & {
        status?: number;
        errorCode?: string;
      };
      error.status = response.status;
      error.errorCode = typeof json?.errorCode === "string" ? json.errorCode : undefined;
      throw error;
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
};

const mapWorkspaceMappingProxyError = (error: unknown) => {
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? ((error as { status?: number }).status ?? null)
      : null;
  const pluginCode =
    typeof (error as { errorCode?: unknown })?.errorCode === "string"
      ? ((error as { errorCode?: string }).errorCode ?? null)
      : null;
  if (pluginCode) {
    return {
      errorCode: pluginCode,
      message:
        error instanceof Error ? error.message : "Workspace mapping request failed",
    };
  }
  if (status === 404) {
    return {
      errorCode: "plugin_too_old",
      message:
        "OpenClaw plugin is missing workspace-mapping endpoints. Update kanbanthing-dispatch-protocol and verify capabilities.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      errorCode: "instance_auth_failed",
      message:
        "OpenClaw authentication failed. Verify instance token and plugin secret settings.",
    };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return {
      errorCode: "network_timeout",
      message: "Timed out while contacting the OpenClaw instance.",
    };
  }
  return {
    errorCode: "upstream_unreachable",
    message:
      error instanceof Error
        ? error.message
        : "Failed to contact the OpenClaw plugin endpoint.",
  };
};

const getVerificationFailureMessage = (args: {
  error: unknown;
  isEnhanced: boolean;
}) => {
  const status =
    typeof (args.error as { status?: unknown })?.status === "number"
      ? ((args.error as { status?: number }).status ?? null)
      : null;
  if (status === 404 && args.isEnhanced) {
    return "Plugin verification failed: KanbanThing plugin capabilities endpoint was not found (404). Install or update the plugin, then verify again.";
  }
  if (status === 404 && !args.isEnhanced) {
    return "Connection verification failed";
  }
  if (args.error instanceof Error) {
    if (args.error.name === "AbortError") {
      return args.isEnhanced
        ? "Plugin verification timed out while contacting OpenClaw"
        : "Connection verification timed out while contacting OpenClaw";
    }
    return args.error.message;
  }
  return args.isEnhanced ? "Plugin verification failed" : "Connection verification failed";
};

type VerifyOpenClawInstanceSuccessResult = {
  ok: true;
  capabilities: Record<string, unknown> | null;
  pluginInstalled: boolean;
  verificationMode: "plugin" | "basic";
};

type VerifyOpenClawInstanceFailureResult = {
  ok: false;
  error: string;
  pluginInstalled: boolean;
  verificationMode: "plugin" | "basic";
};

type VerifyOpenClawInstanceResult =
  | VerifyOpenClawInstanceSuccessResult
  | VerifyOpenClawInstanceFailureResult;

export const create = action({
  args: {
    name: v.string(),
    url: v.string(),
    token: v.string(),
    integrationMode: v.optional(v.union(v.literal("basic"), v.literal("enhanced"))),
  },
  handler: async (ctx, args): Promise<Id<"openclawInstances">> => {
    const userId: string = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
    const encryptedToken = await encryptOpenClawToken(args.token, getEncryptionKey());
    const allowLocal = !!process.env.ALLOW_LOCAL_OPENCLAW;
    return await ctx.runMutation(internal.openclawInstances.createEncrypted, {
      userId,
      name: args.name,
      url: args.url,
      encryptedToken,
      ...(args.integrationMode ? { integrationMode: args.integrationMode } : {}),
      allowLocal,
    });
  },
});

export const update = action({
  args: {
    id: v.id("openclawInstances"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    token: v.optional(v.string()),
    integrationMode: v.optional(v.union(v.literal("basic"), v.literal("enhanced"))),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
    const encryptedToken =
      args.token === undefined
        ? undefined
        : await encryptOpenClawToken(args.token, getEncryptionKey());

    const allowLocal = !!process.env.ALLOW_LOCAL_OPENCLAW;
    await ctx.runMutation(internal.openclawInstances.updateEncrypted, {
      id: args.id as Id<"openclawInstances">,
      userId,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.url !== undefined ? { url: args.url } : {}),
      ...(encryptedToken ? { encryptedToken } : {}),
      ...(args.integrationMode !== undefined ? { integrationMode: args.integrationMode } : {}),
      allowLocal,
    });
  },
});

export const regenerateToken = action({
  args: {
    id: v.id("openclawInstances"),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
    const token = generateOpenClawBearerToken();
    const encryptedToken = await encryptOpenClawToken(token, getEncryptionKey());

    await ctx.runMutation(internal.openclawInstances.markTokenRotationPending, {
      id: args.id as Id<"openclawInstances">,
      userId,
      encryptedToken,
    });

    return { token };
  },
});

export const verify = action({
  args: {
    id: v.id("openclawInstances"),
  },
  handler: async (ctx, args): Promise<VerifyOpenClawInstanceResult> => {
    const userId: string = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
    const instance: Doc<"openclawInstances"> | null = await ctx.runQuery(
      internal.openclawInstances.getOwnedEncryptedForDispatch,
      {
        id: args.id as Id<"openclawInstances">,
        userId,
      }
    );
    if (!instance) {
      throw new Error("OpenClaw instance not found");
    }

    const isEnhanced: boolean = (instance.integrationMode ?? "basic") === "enhanced";
    try {
      const { decryptOpenClawToken } = await import("../lib/openclaw-crypto");
      const token = await decryptOpenClawToken(instance.encryptedToken, getEncryptionKey());
      let capabilities: Record<string, unknown> | null = null;
      try {
        capabilities = await verifyOpenClawBearerToken({
          url: instance.url,
          token,
        });
      } catch (error) {
        const status =
          typeof (error as { status?: unknown })?.status === "number"
            ? ((error as { status?: number }).status ?? null)
            : null;
        if (!(status === 404 && !isEnhanced)) {
          throw error;
        }
      }
      await ctx.runMutation(internal.openclawInstances.markTokenHealthy, {
        id: args.id as Id<"openclawInstances">,
        userId,
        mode: isEnhanced ? "enhanced" : "basic",
      });
      return {
        ok: true,
        capabilities,
        pluginInstalled: capabilities !== null,
        verificationMode: isEnhanced ? "plugin" : "basic",
      };
    } catch (error) {
      const message = getVerificationFailureMessage({ error, isEnhanced });
      await ctx.runMutation(internal.openclawInstances.markTokenVerifyFailed, {
        id: args.id as Id<"openclawInstances">,
        userId,
        error: message,
        mode: isEnhanced ? "enhanced" : "basic",
      });
      return {
        ok: false,
        error: message,
        pluginInstalled: false,
        verificationMode: isEnhanced ? "plugin" : "basic",
      };
    }
  },
});

// Convex action context type is intentionally broad here because this helper
// is shared across multiple action handlers in this module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getOwnedInstanceForWizard = async (ctx: any, instanceId: Id<"openclawInstances">) => {
  const userId: string = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
  const instance: Doc<"openclawInstances"> | null = await ctx.runQuery(
    internal.openclawInstances.getOwnedEncryptedForDispatch,
    {
      id: instanceId,
      userId,
    }
  );
  if (!instance) {
    throw new Error("OpenClaw instance not found");
  }
  const { decryptOpenClawToken } = await import("../lib/openclaw-crypto");
  const token = await decryptOpenClawToken(instance.encryptedToken, getEncryptionKey());
  return { instance, token };
};

const ensureMappingCapabilities = async (args: { url: string; token: string }) => {
  const capabilities = await verifyOpenClawBearerToken(args);
  if (!capabilities || capabilities.supportsWorkspaceMappingEndpoints !== true) {
    const error = new Error(
      "OpenClaw plugin is too old. Workspace mapping endpoints are not supported."
    ) as Error & { status?: number };
    error.status = 404;
    throw error;
  }
  return capabilities;
};

type MappingProxyEnvelope = {
  ok: boolean;
  instanceId: Id<"openclawInstances">;
  instanceName: string;
  source: "openclaw-plugin";
  data?: Record<string, unknown> | null;
  errorCode?: string;
  message?: string;
};

export const workspaceMappingInspect = action({
  args: {
    instanceId: v.id("openclawInstances"),
    repoPath: v.string(),
    workspaceId: v.optional(v.string()),
    mappingFile: v.optional(v.string()),
    envFiles: v.optional(v.array(v.string())),
    apiUrlFallback: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MappingProxyEnvelope> => {
    const { instance, token } = await getOwnedInstanceForWizard(ctx, args.instanceId);
    try {
      await ensureMappingCapabilities({ url: instance.url, token });
      const data = await callOpenClawPlugin({
        url: instance.url,
        token,
        path: "/kanbanthing/workspace-mapping/inspect",
        method: "POST",
        body: {
          repoPath: args.repoPath,
          ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
          ...(args.mappingFile ? { mappingFile: args.mappingFile } : {}),
          ...(args.envFiles ? { envFiles: args.envFiles } : {}),
          ...(args.apiUrlFallback ? { apiUrlFallback: args.apiUrlFallback } : {}),
        },
      });
      return {
        ok: true,
        instanceId: args.instanceId,
        instanceName: instance.name,
        source: "openclaw-plugin",
        data,
      };
    } catch (error) {
      const mapped = mapWorkspaceMappingProxyError(error);
      return {
        ok: false,
        instanceId: args.instanceId,
        instanceName: instance.name,
        source: "openclaw-plugin",
        errorCode: mapped.errorCode,
        message: mapped.message,
      };
    }
  },
});

export const workspaceMappingUpsert = action({
  args: {
    instanceId: v.id("openclawInstances"),
    repoPath: v.string(),
    workspaceId: v.optional(v.string()),
    alias: v.optional(v.string()),
    mappingFile: v.optional(v.string()),
    envFiles: v.optional(v.array(v.string())),
    apiUrl: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
    force: v.optional(v.boolean()),
    applySafeFixes: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<MappingProxyEnvelope> => {
    const { instance, token } = await getOwnedInstanceForWizard(ctx, args.instanceId);
    try {
      await ensureMappingCapabilities({ url: instance.url, token });
      const data = await callOpenClawPlugin({
        url: instance.url,
        token,
        path: "/kanbanthing/workspace-mapping/upsert",
        method: "POST",
        body: {
          repoPath: args.repoPath,
          ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
          ...(args.alias ? { alias: args.alias } : {}),
          ...(args.mappingFile ? { mappingFile: args.mappingFile } : {}),
          ...(args.envFiles ? { envFiles: args.envFiles } : {}),
          ...(args.apiUrl ? { apiUrl: args.apiUrl } : {}),
          ...(typeof args.dryRun === "boolean" ? { dryRun: args.dryRun } : {}),
          ...(typeof args.force === "boolean" ? { force: args.force } : {}),
          ...(typeof args.applySafeFixes === "boolean"
            ? { applySafeFixes: args.applySafeFixes }
            : {}),
        },
      });
      return {
        ok: true,
        instanceId: args.instanceId,
        instanceName: instance.name,
        source: "openclaw-plugin",
        data,
      };
    } catch (error) {
      const mapped = mapWorkspaceMappingProxyError(error);
      return {
        ok: false,
        instanceId: args.instanceId,
        instanceName: instance.name,
        source: "openclaw-plugin",
        errorCode: mapped.errorCode,
        message: mapped.message,
      };
    }
  },
});

export const workspaceMappingDoctor = action({
  args: {
    instanceId: v.id("openclawInstances"),
    workspaceId: v.optional(v.string()),
    mappingFile: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MappingProxyEnvelope> => {
    const { instance, token } = await getOwnedInstanceForWizard(ctx, args.instanceId);
    try {
      await ensureMappingCapabilities({ url: instance.url, token });
      const query = new URLSearchParams();
      if (args.workspaceId) query.set("workspaceId", args.workspaceId);
      if (args.mappingFile) query.set("mappingFile", args.mappingFile);
      const data = await callOpenClawPlugin({
        url: instance.url,
        token,
        path: `/kanbanthing/workspace-mapping/doctor${
          query.toString() ? `?${query.toString()}` : ""
        }`,
        method: "GET",
      });
      return {
        ok: true,
        instanceId: args.instanceId,
        instanceName: instance.name,
        source: "openclaw-plugin",
        data,
      };
    } catch (error) {
      const mapped = mapWorkspaceMappingProxyError(error);
      return {
        ok: false,
        instanceId: args.instanceId,
        instanceName: instance.name,
        source: "openclaw-plugin",
        errorCode: mapped.errorCode,
        message: mapped.message,
      };
    }
  },
});
