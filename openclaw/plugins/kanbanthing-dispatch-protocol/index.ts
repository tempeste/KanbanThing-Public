import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

type LoggerLike = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  debug?: (message: string) => void;
};

type MessageReceivedContext = {
  channelId?: string;
  accountId?: string;
  conversationId?: string;
};

type MessageReceivedEvent = {
  content: string;
};

type SubagentSpawnedEvent = {
  runId?: string;
  childSessionKey?: string;
  mode?: string;
  label?: string;
  requester?: {
    channel?: string;
    to?: string;
  };
};

type SubagentEndedEvent = {
  runId?: string;
  outcome?: string;
  reason?: string;
  targetKind?: string;
  error?: string;
};

type BeforeToolCallEvent = {
  toolName?: string;
  params?: Record<string, unknown>;
};

type BeforeToolCallContext = {
  sessionKey?: string;
  toolName?: string;
  agentId?: string;
};

type BeforeToolCallResult = {
  block?: boolean;
  blockReason?: string;
  params?: Record<string, unknown>;
};

type AfterToolCallEvent = {
  toolName?: string;
  error?: string;
  durationMs?: number;
};

type AfterToolCallContext = {
  sessionKey?: string;
  toolName?: string;
  agentId?: string;
};

type SubagentSpawningEvent = {
  childSessionKey?: string;
  agentId?: string;
  label?: string;
  mode?: "run" | "session";
  requester?: {
    channel?: string;
    to?: string;
    accountId?: string;
  };
  threadRequested?: boolean;
};

type SubagentSpawningContext = {
  requesterSessionKey?: string;
  childSessionKey?: string;
  runId?: string;
};

type SubagentSpawningResult =
  | { status: "ok"; threadBindingReady?: boolean }
  | { status: "error"; error: string };

type PluginHooks = {
  message_received: (event: MessageReceivedEvent, ctx: MessageReceivedContext) => Promise<void> | void;
  before_tool_call: (
    event: BeforeToolCallEvent,
    ctx: BeforeToolCallContext
  ) => Promise<BeforeToolCallResult | void> | BeforeToolCallResult | void;
  after_tool_call: (
    event: AfterToolCallEvent,
    ctx: AfterToolCallContext
  ) => Promise<void> | void;
  subagent_spawning: (
    event: SubagentSpawningEvent,
    ctx: SubagentSpawningContext
  ) => Promise<SubagentSpawningResult | void> | SubagentSpawningResult | void;
  subagent_spawned: (event: SubagentSpawnedEvent, ctx: unknown) => Promise<void> | void;
  subagent_ended: (event: SubagentEndedEvent, ctx: unknown) => Promise<void> | void;
  session_start: (
    event: { sessionId?: string; sessionKey?: string },
    ctx: { sessionId?: string; sessionKey?: string }
  ) => Promise<void> | void;
  session_end: (
    event: { sessionId?: string; sessionKey?: string },
    ctx: { sessionId?: string; sessionKey?: string }
  ) => Promise<void> | void;
};

type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  logger?: LoggerLike;
  registerHttpRoute: (params: {
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
  }) => void;
  on: <K extends keyof PluginHooks>(hookName: K, handler: PluginHooks[K]) => void;
};

type DispatchMetadata = {
  kanbanthing_dispatch_v: number;
  workspaceId: string;
  workspaceName?: string;
  ticketCount?: number;
  tickets?: Array<{ id?: string; number?: number; title?: string }>;
};

type PluginConfig = {
  kanbanthingBaseUrl?: string;
  kanbanthingApiKey?: string;
  callbackPath?: string;
  pluginSecret?: string;
  emitReceivedCallbacks?: boolean;
  enforceCancellation?: boolean;
  hardKillMode?: "off" | "best_effort" | "internal_api";
  emitProgressEvents?: boolean;
  internalApiPathHint?: string;
};

type CancelRequest = {
  workspaceId?: string;
  dispatchId?: string;
  runId?: string;
  ticketIds?: string[];
  reason?: string;
};

const DEFAULT_CALLBACK_PATH = "/api/openclaw/dispatch-events";
const MAX_SEEN_EVENTS = 500;

const receiptDedupe = new Map<string, number>();
const lifecycleDedupe = new Map<string, number>();
const cancelRegistry = new Map<string, { createdAt: number; payload: CancelRequest }>();
const dispatchByConversation = new Map<
  string,
  {
    workspaceId: string;
    ticketIds: string[];
    dispatchId: string;
    createdAt: number;
  }
>();
const dispatchByRunId = new Map<
  string,
  {
    workspaceId: string;
    ticketIds: string[];
    dispatchId: string;
    createdAt: number;
  }
>();
const dispatchBySessionKey = new Map<
  string,
  {
    workspaceId: string;
    ticketIds: string[];
    dispatchId: string;
    runId?: string;
    createdAt: number;
  }
>();
const cancelResultDedupe = new Map<string, number>();
const progressThrottle = new Map<string, number>();
const sessionIdBySessionKey = new Map<string, string>();
const sessionKeyBySessionId = new Map<string, string>();
const PROGRESS_MIN_INTERVAL_MS = 15_000;

function now() {
  return Date.now();
}

function trimOldEntries(map: Map<string, unknown>, max = MAX_SEEN_EVENTS) {
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function conversationKey(channelId?: string, conversationId?: string) {
  if (!channelId || !conversationId) return null;
  return `${channelId}:${conversationId}`;
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

function normalizeBaseUrl(input?: string) {
  if (!input) return null;
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

type OpenClawInternalApis = {
  abortEmbeddedPiRun?: (sessionId: string) => boolean;
  queueEmbeddedPiMessage?: (sessionId: string, text: string) => boolean;
};

let cachedInternalApis: OpenClawInternalApis | null | undefined;

async function loadOpenClawInternalApis(api: PluginApi): Promise<OpenClawInternalApis | null> {
  if (cachedInternalApis !== undefined) {
    return cachedInternalApis;
  }
  const cfg = getConfig(api);
  const candidates = [
    typeof cfg.internalApiPathHint === "string" ? cfg.internalApiPathHint.trim() : "",
    path.join(process.cwd(), "dist/agents/pi-embedded.js"),
    path.join(process.cwd(), "node_modules/openclaw/dist/agents/pi-embedded.js"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      const mod = (await import(pathToFileURL(candidate).href)) as Record<string, unknown>;
      const apis: OpenClawInternalApis = {
        abortEmbeddedPiRun:
          typeof mod.abortEmbeddedPiRun === "function"
            ? (mod.abortEmbeddedPiRun as (sessionId: string) => boolean)
            : undefined,
        queueEmbeddedPiMessage:
          typeof mod.queueEmbeddedPiMessage === "function"
            ? (mod.queueEmbeddedPiMessage as (sessionId: string, text: string) => boolean)
            : undefined,
      };
      if (apis.abortEmbeddedPiRun || apis.queueEmbeddedPiMessage) {
        cachedInternalApis = apis;
        api.logger?.info?.(
          `[kanbanthing-dispatch] loaded OpenClaw internal APIs from ${candidate}`,
        );
        return apis;
      }
    } catch (error) {
      api.logger?.warn?.(
        `[kanbanthing-dispatch] failed loading OpenClaw internal APIs from ${candidate}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  cachedInternalApis = null;
  return null;
}

function getConfig(api: PluginApi): Required<
  Pick<
    PluginConfig,
    "callbackPath" | "emitReceivedCallbacks" | "enforceCancellation" | "hardKillMode" | "emitProgressEvents"
  >
> &
  PluginConfig {
  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  return {
    ...cfg,
    callbackPath:
      typeof cfg.callbackPath === "string" && cfg.callbackPath.trim()
        ? cfg.callbackPath.trim()
        : DEFAULT_CALLBACK_PATH,
    emitReceivedCallbacks:
      typeof cfg.emitReceivedCallbacks === "boolean" ? cfg.emitReceivedCallbacks : true,
    enforceCancellation:
      typeof cfg.enforceCancellation === "boolean" ? cfg.enforceCancellation : true,
    hardKillMode:
      cfg.hardKillMode === "best_effort" || cfg.hardKillMode === "internal_api"
        ? cfg.hardKillMode
        : "off",
    emitProgressEvents:
      typeof cfg.emitProgressEvents === "boolean" ? cfg.emitProgressEvents : true,
  };
}

function isAuthorized(req: IncomingMessage, api: PluginApi) {
  const { pluginSecret } = getConfig(api);
  if (!pluginSecret) return true;
  const provided = req.headers["x-kanbanthing-plugin-secret"];
  const token = Array.isArray(provided) ? provided[0] : provided;
  return token === pluginSecret;
}

function parseDispatchMetadata(content: string): DispatchMetadata | null {
  const fenceRegex = /```json\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(content))) {
    try {
      const parsed = JSON.parse(match[1]) as DispatchMetadata;
      if (
        parsed &&
        parsed.kanbanthing_dispatch_v === 1 &&
        typeof parsed.workspaceId === "string" &&
        Array.isArray(parsed.tickets)
      ) {
        return parsed;
      }
    } catch {
      // ignore non-KanbanThing JSON blocks
    }
  }
  return null;
}

function buildReceiptEventId(params: {
  metadata: DispatchMetadata;
  channelId?: string;
  conversationId?: string;
  content: string;
}) {
  const stable = JSON.stringify({
    workspaceId: params.metadata.workspaceId,
    tickets: (params.metadata.tickets ?? []).map((t) => t.id ?? ""),
    channelId: params.channelId ?? null,
    conversationId: params.conversationId ?? null,
    contentHash: createHash("sha256").update(params.content).digest("hex"),
  });
  return createHash("sha256").update(stable).digest("hex");
}

async function postCallback(api: PluginApi, payload: Record<string, unknown>) {
  const cfg = getConfig(api);
  const baseUrl = normalizeBaseUrl(cfg.kanbanthingBaseUrl);
  const apiKey = typeof cfg.kanbanthingApiKey === "string" ? cfg.kanbanthingApiKey.trim() : "";
  if (!baseUrl || !apiKey) {
    api.logger?.warn?.("[kanbanthing-dispatch] callback skipped: missing kanbanthingBaseUrl/apiKey");
    return;
  }

  const url = `${baseUrl}${cfg.callbackPath.startsWith("/") ? "" : "/"}${cfg.callbackPath}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`KanbanThing callback failed (${response.status}): ${text.slice(0, 200)}`);
  }
}

function dispatchKeyFromCancel(payload: CancelRequest) {
  if (typeof payload.dispatchId === "string" && payload.dispatchId.trim()) {
    return `dispatch:${payload.dispatchId.trim()}`;
  }
  if (typeof payload.runId === "string" && payload.runId.trim()) {
    return `run:${payload.runId.trim()}`;
  }
  const tickets = Array.isArray(payload.ticketIds) ? payload.ticketIds.filter(Boolean).sort() : [];
  const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : "";
  if (!workspaceId && tickets.length === 0) return null;
  return `fallback:${workspaceId}:${tickets.join(",")}`;
}

function trackedDispatchKey(tracked: { dispatchId: string; workspaceId: string; ticketIds: string[] }) {
  return `dispatch:${tracked.dispatchId}`;
}

function trackedFallbackKey(tracked: { dispatchId: string; workspaceId: string; ticketIds: string[] }) {
  return `fallback:${tracked.workspaceId}:${tracked.ticketIds.slice().sort().join(",")}`;
}

type HardKillAttemptSummary = {
  mode: "off" | "best_effort" | "internal_api";
  attempted: boolean;
  sessionsConsidered: number;
  sessionsResolvedToSessionId?: number;
  abortCallsSucceeded: number;
  stopMessagesQueued: number;
  internalApiLoaded: boolean;
  limitations?: string;
};

type CancelMode =
  | "signal_only"
  | "enforced"
  | "best_effort_hard_kill"
  | "deterministic_hard_kill";

function getConfiguredCancelMode(cfg: ReturnType<typeof getConfig>): CancelMode {
  if (cfg.hardKillMode === "internal_api") return "deterministic_hard_kill";
  if (cfg.hardKillMode === "best_effort") return "best_effort_hard_kill";
  if (cfg.enforceCancellation) return "enforced";
  return "signal_only";
}

function getCancelModeFromAttempt(
  cfg: ReturnType<typeof getConfig>,
  hardKillAttempt: HardKillAttemptSummary | null
): CancelMode {
  if (!hardKillAttempt) return getConfiguredCancelMode(cfg);
  if (
    hardKillAttempt.mode === "internal_api" &&
    (hardKillAttempt.sessionsResolvedToSessionId ?? 0) > 0 &&
    hardKillAttempt.abortCallsSucceeded > 0
  ) {
    return "deterministic_hard_kill";
  }
  if (
    hardKillAttempt.mode === "best_effort" &&
    (hardKillAttempt.abortCallsSucceeded > 0 || hardKillAttempt.stopMessagesQueued > 0)
  ) {
    return "best_effort_hard_kill";
  }
  return getConfiguredCancelMode(cfg);
}

async function attemptHardKillForDispatch(
  api: PluginApi,
  params: {
    tracked:
      | { dispatchId: string; workspaceId: string; ticketIds: string[] }
      | null;
    cancelPayload: CancelRequest;
  },
): Promise<HardKillAttemptSummary> {
  const cfg = getConfig(api);
  const mode = cfg.hardKillMode;
  if (mode === "off") {
    return {
      mode,
      attempted: false,
      sessionsConsidered: 0,
      abortCallsSucceeded: 0,
      stopMessagesQueued: 0,
      internalApiLoaded: false,
    };
  }

  const tracked = params.tracked;
  const sessionEntries = tracked
    ? Array.from(dispatchBySessionKey.entries()).filter(([, value]) => value.dispatchId === tracked.dispatchId)
    : [];

  const internalApis = await loadOpenClawInternalApis(api);
  const summary: HardKillAttemptSummary = {
    mode,
    attempted: true,
    sessionsConsidered: sessionEntries.length,
    sessionsResolvedToSessionId: 0,
    abortCallsSucceeded: 0,
    stopMessagesQueued: 0,
    internalApiLoaded: Boolean(internalApis),
  };

  if (!internalApis || (!internalApis.abortEmbeddedPiRun && !internalApis.queueEmbeddedPiMessage)) {
    summary.limitations =
      "OpenClaw internal APIs unavailable in plugin runtime; hard-kill downgraded to cancellation enforcement only.";
    return summary;
  }

  for (const [sessionKey] of sessionEntries) {
    const resolvedSessionId = sessionIdBySessionKey.get(sessionKey) ?? null;
    if (resolvedSessionId) {
      summary.sessionsResolvedToSessionId = (summary.sessionsResolvedToSessionId ?? 0) + 1;
    }
    const abortTarget = resolvedSessionId ?? sessionKey;
    const stopTarget = resolvedSessionId ?? sessionKey;
    if (internalApis.abortEmbeddedPiRun) {
      try {
        if (internalApis.abortEmbeddedPiRun(abortTarget)) {
          summary.abortCallsSucceeded += 1;
        }
      } catch {
        // ignore and continue to next fallback
      }
    }
    if (internalApis.queueEmbeddedPiMessage) {
      try {
        if (internalApis.queueEmbeddedPiMessage(stopTarget, "/stop")) {
          summary.stopMessagesQueued += 1;
        }
      } catch {
        // ignore
      }
    }
  }

  if (
    summary.sessionsConsidered > 0 &&
    summary.abortCallsSucceeded === 0 &&
    summary.stopMessagesQueued === 0
  ) {
    summary.limitations =
      mode === "internal_api" && (summary.sessionsResolvedToSessionId ?? 0) > 0
        ? "Deterministic sessionId resolution succeeded, but no internal abort/stop call reported success."
        : "No best-effort abort succeeded (likely sessionKey/sessionId mismatch). Cancellation enforcement hooks still block further work where supported.";
  }
  if (summary.sessionsConsidered === 0) {
    summary.limitations =
      "No tracked subagent session keys yet for this dispatch; hard-kill will rely on later enforcement hooks.";
  }
  return summary;
}

function findCancelForTrackedDispatch(params: {
  tracked: { dispatchId: string; workspaceId: string; ticketIds: string[] };
  runId?: string | null;
}) {
  if (params.runId) {
    const byRun = cancelRegistry.get(`run:${params.runId}`);
    if (byRun) return byRun;
  }
  const byDispatch = cancelRegistry.get(trackedDispatchKey(params.tracked));
  if (byDispatch) return byDispatch;
  const byFallback = cancelRegistry.get(trackedFallbackKey(params.tracked));
  if (byFallback) return byFallback;
  return null;
}

async function emitCancelResult(
  api: PluginApi,
  params: {
    tracked: { dispatchId: string; workspaceId: string; ticketIds: string[] };
    runId?: string | null;
    result: "cancelled" | "too_late_to_cancel";
    reason?: string | null;
    cancelMode?: CancelMode;
  },
) {
  const dedupeKey = JSON.stringify({
    type: "dispatch.cancel_result",
    dispatchId: params.tracked.dispatchId,
    runId: params.runId ?? null,
    result: params.result,
  });
  const eventId = createHash("sha256").update(dedupeKey).digest("hex");
  if (cancelResultDedupe.has(eventId)) return;
  cancelResultDedupe.set(eventId, now());
  trimOldEntries(cancelResultDedupe, MAX_SEEN_EVENTS);

  await postCallback(api, {
    workspaceId: params.tracked.workspaceId,
    event: "dispatch.cancel_result",
    eventId,
    dispatchId: params.tracked.dispatchId,
    ...(params.runId ? { runId: params.runId } : {}),
    ticketIds: params.tracked.ticketIds,
    occurredAt: now(),
    message:
      params.result === "too_late_to_cancel"
        ? "Dispatch had already started before cancellation could be enforced."
        : "Dispatch cancelled.",
    metadata: {
      result: params.result,
      cancelMode: params.cancelMode ?? getConfiguredCancelMode(getConfig(api)),
      ...(params.reason ? { reason: params.reason } : {}),
      pluginId: "kanbanthing-dispatch-protocol",
    },
  });
}

async function emitTicketProgress(
  api: PluginApi,
  params: {
    tracked: { dispatchId: string; workspaceId: string; ticketIds: string[] };
    runId?: string | null;
    sessionKey?: string | null;
    phase: "tool_start" | "tool_end";
    toolName: string;
    error?: string | null;
    durationMs?: number | null;
  },
) {
  const cfg = getConfig(api);
  if (!cfg.emitProgressEvents) return;
  const throttleKey = [
    params.tracked.dispatchId,
    params.runId ?? params.sessionKey ?? "no-session",
    params.phase,
    params.toolName,
    params.error ? "err" : "ok",
  ].join("|");
  const lastAt = progressThrottle.get(throttleKey) ?? 0;
  const ts = now();
  if (ts - lastAt < PROGRESS_MIN_INTERVAL_MS) {
    return;
  }
  progressThrottle.set(throttleKey, ts);
  trimOldEntries(progressThrottle, MAX_SEEN_EVENTS * 4);

  const eventId = createHash("sha256")
    .update(
      JSON.stringify({
        type: "ticket.progress",
        dispatchId: params.tracked.dispatchId,
        runId: params.runId ?? null,
        sessionKey: params.sessionKey ?? null,
        phase: params.phase,
        toolName: params.toolName,
        bucket: Math.floor(ts / PROGRESS_MIN_INTERVAL_MS),
      }),
    )
    .digest("hex");

  await postCallback(api, {
    workspaceId: params.tracked.workspaceId,
    event: "ticket.progress",
    eventId,
    dispatchId: params.tracked.dispatchId,
    ...(params.runId ? { runId: params.runId } : {}),
    ticketIds: params.tracked.ticketIds,
    occurredAt: ts,
    message:
      params.phase === "tool_start"
        ? `Running tool: ${params.toolName}`
        : params.error
          ? `Tool failed: ${params.toolName}`
          : `Completed tool: ${params.toolName}`,
    metadata: {
      phase: params.phase,
      toolName: params.toolName,
      ...(typeof params.durationMs === "number" ? { durationMs: params.durationMs } : {}),
      ...(params.error ? { error: params.error } : {}),
      pluginId: "kanbanthing-dispatch-protocol",
    },
  });
}

async function emitTicketBlocked(
  api: PluginApi,
  params: {
    tracked: { dispatchId: string; workspaceId: string; ticketIds: string[] };
    runId?: string | null;
    sessionKey?: string | null;
    toolName: string;
    error: string;
  },
) {
  const cfg = getConfig(api);
  if (!cfg.emitProgressEvents) return;
  const ts = now();
  const throttleKey = [
    params.tracked.dispatchId,
    params.runId ?? params.sessionKey ?? "no-session",
    "blocked",
    params.toolName,
    params.error.slice(0, 64),
  ].join("|");
  const lastAt = progressThrottle.get(throttleKey) ?? 0;
  if (ts - lastAt < PROGRESS_MIN_INTERVAL_MS) return;
  progressThrottle.set(throttleKey, ts);
  trimOldEntries(progressThrottle, MAX_SEEN_EVENTS * 4);

  const eventId = createHash("sha256")
    .update(
      JSON.stringify({
        type: "ticket.blocked",
        dispatchId: params.tracked.dispatchId,
        runId: params.runId ?? null,
        sessionKey: params.sessionKey ?? null,
        toolName: params.toolName,
        bucket: Math.floor(ts / PROGRESS_MIN_INTERVAL_MS),
      }),
    )
    .digest("hex");

  await postCallback(api, {
    workspaceId: params.tracked.workspaceId,
    event: "ticket.blocked",
    eventId,
    dispatchId: params.tracked.dispatchId,
    ...(params.runId ? { runId: params.runId } : {}),
    ticketIds: params.tracked.ticketIds,
    occurredAt: ts,
    message: `Tool blocked: ${params.toolName}`,
    metadata: {
      toolName: params.toolName,
      error: params.error,
      pluginId: "kanbanthing-dispatch-protocol",
    },
  });
}

export default function register(api: PluginApi) {
  api.registerHttpRoute({
    path: "/kanbanthing/capabilities",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "GET") {
        writeJson(res, 405, { error: "Method not allowed" });
        return;
      }
      if (!isAuthorized(req, api)) {
        writeJson(res, 401, { error: "Unauthorized" });
        return;
      }
      const cfg = getConfig(api);
      const cancelMode = getConfiguredCancelMode(cfg);
      writeJson(res, 200, {
        ok: true,
        pluginId: "kanbanthing-dispatch-protocol",
        protocolVersion: 1,
        supportsCallbacks: true,
        supportedCallbackEvents: [
          "dispatch.received",
          "dispatch.started",
          "dispatch.finished",
          "dispatch.failed",
          "dispatch.cancel_ack",
          "dispatch.cancel_result",
        ],
        supportsCancel: true,
        cancelMode,
        supportsCancelAck: true,
        supportsCancelResult: true,
        supportsCancellationEnforcement: cfg.enforceCancellation,
        supportsHardKill:
          cfg.hardKillMode === "best_effort" || cfg.hardKillMode === "internal_api",
        hardKillMode: cfg.hardKillMode,
        supportsHeartbeat: false,
        supportsProgressEvents: cfg.emitProgressEvents,
        supportsSessionKeySessionIdMapping: true,
        config: {
          callbackPath: cfg.callbackPath,
          emitReceivedCallbacks: cfg.emitReceivedCallbacks,
          enforceCancellation: cfg.enforceCancellation,
          hardKillMode: cfg.hardKillMode,
          emitProgressEvents: cfg.emitProgressEvents,
          hasPluginSecret: Boolean(cfg.pluginSecret),
          hasKanbanThingConfig:
            Boolean(normalizeBaseUrl(cfg.kanbanthingBaseUrl)) &&
            Boolean(typeof cfg.kanbanthingApiKey === "string" && cfg.kanbanthingApiKey.trim()),
        },
        now: now(),
      });
    },
  });

  api.registerHttpRoute({
    path: "/kanbanthing/dispatch/cancel",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST") {
        writeJson(res, 405, { error: "Method not allowed" });
        return;
      }
      if (!isAuthorized(req, api)) {
        writeJson(res, 401, { error: "Unauthorized" });
        return;
      }

      let payload: CancelRequest;
      try {
        payload = await readJsonBody<CancelRequest>(req);
      } catch (error) {
        writeJson(res, 400, { error: "Invalid JSON body", detail: String(error) });
        return;
      }

      const key = dispatchKeyFromCancel(payload);
      if (!key) {
        writeJson(res, 400, { error: "dispatchId, runId, or (workspaceId + ticketIds) required" });
        return;
      }

      cancelRegistry.set(key, { createdAt: now(), payload });
      trimOldEntries(cancelRegistry, MAX_SEEN_EVENTS);

      const cfg = getConfig(api);
      const configuredCancelMode = getConfiguredCancelMode(cfg);

      writeJson(res, 200, {
        ok: true,
        accepted: true,
        cancelMode: configuredCancelMode,
        key,
      });

      const trackedForCancel = (() => {
        if (typeof payload.runId === "string" && payload.runId) {
          const byRun = dispatchByRunId.get(payload.runId);
          if (byRun) return byRun;
        }
        if (typeof payload.dispatchId === "string" && payload.dispatchId) {
          const convMatches = Array.from(dispatchByConversation.values()).find(
            (v) => v.dispatchId === payload.dispatchId
          );
          if (convMatches) return convMatches;
          const runMatches = Array.from(dispatchByRunId.values()).find(
            (v) => v.dispatchId === payload.dispatchId
          );
          if (runMatches) return runMatches;
        }
        return null;
      })();

      let hardKillAttempt: HardKillAttemptSummary | null = null;
      try {
        hardKillAttempt = await attemptHardKillForDispatch(api, {
          tracked: trackedForCancel,
          cancelPayload: payload,
        });
      } catch (error) {
        api.logger?.warn?.(
          `[kanbanthing-dispatch] hard-kill attempt failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      if (payload.workspaceId && Array.isArray(payload.ticketIds) && payload.ticketIds.length > 0) {
        const eventId = createHash("sha256")
          .update(JSON.stringify({ type: "dispatch.cancel_ack", key, payload }))
          .digest("hex");
        postCallback(api, {
          workspaceId: payload.workspaceId,
          event: "dispatch.cancel_ack",
          eventId,
          ...(typeof payload.dispatchId === "string" ? { dispatchId: payload.dispatchId } : {}),
          ...(typeof payload.runId === "string" ? { runId: payload.runId } : {}),
          ticketIds: payload.ticketIds,
          occurredAt: now(),
          message: `OpenClaw plugin accepted cancellation request (${getCancelModeFromAttempt(
            cfg,
            hardKillAttempt
          ).replace(/_/g, " ")} mode).`,
          metadata: {
            cancelMode: getCancelModeFromAttempt(cfg, hardKillAttempt),
            pluginId: "kanbanthing-dispatch-protocol",
            ...(hardKillAttempt ? { hardKillAttempt } : {}),
          },
        }).catch((error) => {
          api.logger?.warn?.(
            `[kanbanthing-dispatch] cancel_ack callback failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }
    },
  });

  api.on("message_received", async (event, ctx) => {
    const cfg = getConfig(api);
    if (!cfg.emitReceivedCallbacks) return;
    if (!event || typeof event.content !== "string" || !event.content.includes("kanbanthing_dispatch_v")) {
      return;
    }

    const metadata = parseDispatchMetadata(event.content);
    if (!metadata) return;

    const ticketIds = (metadata.tickets ?? [])
      .map((ticket) => (typeof ticket?.id === "string" ? ticket.id : ""))
      .filter(Boolean);
    if (ticketIds.length === 0) return;

    const eventId = buildReceiptEventId({
      metadata,
      channelId: ctx?.channelId,
      conversationId: ctx?.conversationId,
      content: event.content,
    });

    if (receiptDedupe.has(eventId)) {
      return;
    }
    receiptDedupe.set(eventId, now());
    trimOldEntries(receiptDedupe, MAX_SEEN_EVENTS);

    const derivedDispatchId = `derived:${eventId.slice(0, 16)}`;
    const convKey = conversationKey(ctx?.channelId, ctx?.conversationId);
    if (convKey) {
      dispatchByConversation.set(convKey, {
        workspaceId: metadata.workspaceId,
        ticketIds,
        dispatchId: derivedDispatchId,
        createdAt: now(),
      });
      trimOldEntries(dispatchByConversation, MAX_SEEN_EVENTS);
    }

    try {
      await postCallback(api, {
        workspaceId: metadata.workspaceId,
        event: "dispatch.received",
        eventId,
        dispatchId: derivedDispatchId,
        ticketIds,
        occurredAt: now(),
        message: "OpenClaw gateway received KanbanThing dispatch message.",
        metadata: {
          kanbanthingDispatchVersion: metadata.kanbanthing_dispatch_v,
          workspaceName: metadata.workspaceName ?? null,
          ticketCount: metadata.ticketCount ?? ticketIds.length,
          channelId: ctx?.channelId ?? null,
          accountId: ctx?.accountId ?? null,
          conversationId: ctx?.conversationId ?? null,
        },
      });
      api.logger?.info?.(
        `[kanbanthing-dispatch] sent dispatch.received callback workspace=${metadata.workspaceId} tickets=${ticketIds.length}`,
      );
    } catch (error) {
      api.logger?.warn?.(
        `[kanbanthing-dispatch] dispatch.received callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  api.on("session_start", async (event, ctx) => {
    const sessionId =
      (typeof event?.sessionId === "string" && event.sessionId) ||
      (typeof ctx?.sessionId === "string" && ctx.sessionId) ||
      null;
    const sessionKey =
      (typeof event?.sessionKey === "string" && event.sessionKey) ||
      (typeof ctx?.sessionKey === "string" && ctx.sessionKey) ||
      null;
    if (!sessionId || !sessionKey) return;
    sessionIdBySessionKey.set(sessionKey, sessionId);
    sessionKeyBySessionId.set(sessionId, sessionKey);
    trimOldEntries(sessionIdBySessionKey, MAX_SEEN_EVENTS * 4);
    trimOldEntries(sessionKeyBySessionId, MAX_SEEN_EVENTS * 4);
  });

  api.on("session_end", async (event, ctx) => {
    const sessionId =
      (typeof event?.sessionId === "string" && event.sessionId) ||
      (typeof ctx?.sessionId === "string" && ctx.sessionId) ||
      null;
    const sessionKey =
      (typeof event?.sessionKey === "string" && event.sessionKey) ||
      (typeof ctx?.sessionKey === "string" && ctx.sessionKey) ||
      null;

    if (sessionKey) {
      const mappedSessionId = sessionIdBySessionKey.get(sessionKey);
      sessionIdBySessionKey.delete(sessionKey);
      if (!sessionId && mappedSessionId) {
        sessionKeyBySessionId.delete(mappedSessionId);
      }
    }
    if (sessionId) {
      const mappedSessionKey = sessionKeyBySessionId.get(sessionId);
      sessionKeyBySessionId.delete(sessionId);
      if (!sessionKey && mappedSessionKey) {
        sessionIdBySessionKey.delete(mappedSessionKey);
      }
    }
  });

  api.on("subagent_spawning", async (event) => {
    const convKey = conversationKey(event?.requester?.channel, event?.requester?.to);
    if (!convKey) return;
    const tracked = dispatchByConversation.get(convKey);
    if (!tracked) return;
    const cfg = getConfig(api);

    if (typeof event?.childSessionKey === "string" && event.childSessionKey) {
      dispatchBySessionKey.set(event.childSessionKey, { ...tracked, createdAt: now() });
      trimOldEntries(dispatchBySessionKey, MAX_SEEN_EVENTS);
    }

    const cancelRequest = findCancelForTrackedDispatch({ tracked, runId: null });
    if (!cancelRequest || !cfg.enforceCancellation) {
      return { status: "ok" };
    }

    try {
      await emitCancelResult(api, {
        tracked,
        result: "cancelled",
        reason: "blocked_before_spawn",
      });
    } catch (error) {
      api.logger?.warn?.(
        `[kanbanthing-dispatch] dispatch.cancel_result callback failed during subagent_spawning: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      status: "error",
      error: "Dispatch was cancelled before subagent spawn; blocked by KanbanThing plugin.",
    };
  });

  api.on("subagent_spawned", async (event) => {
    const convKey = conversationKey(event?.requester?.channel, event?.requester?.to);
    if (!convKey) return;
    const tracked = dispatchByConversation.get(convKey);
    if (!tracked || typeof event?.runId !== "string" || !event.runId) return;

    dispatchByRunId.set(event.runId, { ...tracked, createdAt: now() });
    trimOldEntries(dispatchByRunId, MAX_SEEN_EVENTS);
    if (typeof event?.childSessionKey === "string" && event.childSessionKey) {
      dispatchBySessionKey.set(event.childSessionKey, { ...tracked, createdAt: now() });
      const existing = dispatchBySessionKey.get(event.childSessionKey);
      if (existing) {
        dispatchBySessionKey.set(event.childSessionKey, {
          ...existing,
          runId: event.runId,
          createdAt: now(),
        });
      }
      trimOldEntries(dispatchBySessionKey, MAX_SEEN_EVENTS);
    }

    const eventId = createHash("sha256")
      .update(JSON.stringify({ type: "dispatch.started", runId: event.runId, dispatchId: tracked.dispatchId }))
      .digest("hex");
    if (lifecycleDedupe.has(eventId)) return;
    lifecycleDedupe.set(eventId, now());
    trimOldEntries(lifecycleDedupe, MAX_SEEN_EVENTS);

    try {
      await postCallback(api, {
        workspaceId: tracked.workspaceId,
        event: "dispatch.started",
        eventId,
        dispatchId: tracked.dispatchId,
        runId: event.runId,
        ticketIds: tracked.ticketIds,
        occurredAt: now(),
        message: "OpenClaw spawned a subagent for this dispatch.",
        metadata: {
          mode: event?.mode ?? null,
          label: event?.label ?? null,
        },
      });
      const cancelRequest = findCancelForTrackedDispatch({
        tracked,
        runId: event.runId,
      });
      if (cancelRequest) {
        await emitCancelResult(api, {
          tracked,
          runId: event.runId,
          result: "too_late_to_cancel",
          reason: "run_started",
        });
      }
    } catch (error) {
      api.logger?.warn?.(
        `[kanbanthing-dispatch] dispatch.started callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  api.on("before_tool_call", async (event, ctx) => {
    const cfg = getConfig(api);
    const sessionKey = typeof ctx?.sessionKey === "string" ? ctx.sessionKey : null;
    if (!sessionKey) return;
    const tracked = dispatchBySessionKey.get(sessionKey);
    if (!tracked) return;
    const toolName =
      (typeof event?.toolName === "string" && event.toolName) ||
      (typeof ctx?.toolName === "string" && ctx.toolName) ||
      "unknown";
    const cancelRequest = findCancelForTrackedDispatch({ tracked, runId: null });
    if (cancelRequest) {
      if (cfg.enforceCancellation) {
        try {
          await emitCancelResult(api, {
            tracked,
            result: "cancelled",
            reason: "tool_call_blocked_after_cancel",
          });
        } catch (error) {
          api.logger?.warn?.(
            `[kanbanthing-dispatch] dispatch.cancel_result callback failed during before_tool_call: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        return {
          block: true,
          blockReason: "Blocked by KanbanThing plugin: dispatch cancellation requested.",
        };
      }
      return;
    }

    try {
      await emitTicketProgress(api, {
        tracked,
        runId: tracked.runId ?? null,
        sessionKey,
        phase: "tool_start",
        toolName,
      });
    } catch (error) {
      api.logger?.warn?.(
        `[kanbanthing-dispatch] ticket.progress(tool_start) callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  api.on("after_tool_call", async (event, ctx) => {
    const sessionKey = typeof ctx?.sessionKey === "string" ? ctx.sessionKey : null;
    if (!sessionKey) return;
    const tracked = dispatchBySessionKey.get(sessionKey);
    if (!tracked) return;
    const toolName =
      (typeof event?.toolName === "string" && event.toolName) ||
      (typeof ctx?.toolName === "string" && ctx.toolName) ||
      "unknown";
    const cancelRequest = findCancelForTrackedDispatch({ tracked, runId: null });
    if (cancelRequest) return;

    try {
      await emitTicketProgress(api, {
        tracked,
        runId: tracked.runId ?? null,
        sessionKey,
        phase: "tool_end",
        toolName,
        error: typeof event?.error === "string" ? event.error : null,
        durationMs: typeof event?.durationMs === "number" ? event.durationMs : null,
      });
      if (typeof event?.error === "string" && event.error.trim()) {
        await emitTicketBlocked(api, {
          tracked,
          runId: tracked.runId ?? null,
          sessionKey,
          toolName,
          error: event.error,
        });
      }
    } catch (error) {
      api.logger?.warn?.(
        `[kanbanthing-dispatch] ticket.progress(tool_end) callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  api.on("subagent_ended", async (event) => {
    const runId = typeof event?.runId === "string" ? event.runId : null;
    if (!runId) return;
    const tracked = dispatchByRunId.get(runId);
    if (!tracked) return;

    const outcome = typeof event?.outcome === "string" ? event.outcome : "ok";
    const isFailure = outcome === "error" || outcome === "timeout";
    const eventType = isFailure ? "dispatch.failed" : "dispatch.finished";
    const eventId = createHash("sha256")
      .update(JSON.stringify({ type: eventType, runId, outcome, dispatchId: tracked.dispatchId }))
      .digest("hex");
    if (lifecycleDedupe.has(eventId)) return;
    lifecycleDedupe.set(eventId, now());
    trimOldEntries(lifecycleDedupe, MAX_SEEN_EVENTS);

    try {
      await postCallback(api, {
        workspaceId: tracked.workspaceId,
        event: eventType,
        eventId,
        dispatchId: tracked.dispatchId,
        runId,
        ticketIds: tracked.ticketIds,
        occurredAt: now(),
        message:
          isFailure && typeof event?.error === "string"
            ? event.error
            : `OpenClaw subagent ended (${outcome}).`,
        metadata: {
          outcome,
          reason: typeof event?.reason === "string" ? event.reason : null,
          targetKind: typeof event?.targetKind === "string" ? event.targetKind : null,
        },
      });
      const cancelRequest = findCancelForTrackedDispatch({ tracked, runId });
      if (cancelRequest) {
        const outcomeText = typeof event?.outcome === "string" ? event.outcome.toLowerCase() : "";
        const reasonText = typeof event?.reason === "string" ? event.reason.toLowerCase() : "";
        const indicatesCancellation =
          outcomeText.includes("cancel") ||
          outcomeText.includes("abort") ||
          reasonText.includes("cancel") ||
          reasonText.includes("abort");
        if (indicatesCancellation) {
          await emitCancelResult(api, {
            tracked,
            runId,
            result: "cancelled",
            reason: typeof event?.reason === "string" ? event.reason : null,
          });
        } else {
          await emitCancelResult(api, {
            tracked,
            runId,
            result: "too_late_to_cancel",
            reason: "completed_before_cancel_enforced",
          });
        }
      }
    } catch (error) {
      api.logger?.warn?.(
        `[kanbanthing-dispatch] ${eventType} callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}
