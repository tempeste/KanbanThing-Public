import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import register from "@/openclaw/plugins/kanbanthing-dispatch-protocol/index";

type MockReq = AsyncIterable<Buffer> & {
  method: string;
  headers: Record<string, string>;
  bodyText?: string;
};

type MockRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader: (key: string, value: string) => void;
  end: (value?: string) => void;
};

type RouteHandler = (req: MockReq, res: MockRes) => Promise<void> | void;
type HookHandler = (...args: unknown[]) => unknown;

const makeReq = (params: {
  method: string;
  headers?: Record<string, string>;
  bodyText?: string;
}) => ({
  method: params.method,
  headers: params.headers ?? {},
  bodyText: params.bodyText,
  async *[Symbol.asyncIterator]() {
    if (params.bodyText !== undefined) {
      yield Buffer.from(params.bodyText, "utf8");
    }
  },
});

const makeRes = () => {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    setHeader: vi.fn((key: string, value: string) => {
      res.headers[key.toLowerCase()] = value;
    }),
    end: vi.fn((value?: string) => {
      res.body = value ?? "";
    }),
  };
  return res;
};

describe("kanbanthing-dispatch-protocol plugin", () => {
  const hooks: Record<string, HookHandler> = {};
  const routes = new Map<string, RouteHandler>();
  // Test harness uses partial plugin API mocks that intentionally don't satisfy full Node http typings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api: any = {
    pluginConfig: {
      kanbanthingBaseUrl: "http://localhost:3000",
      kanbanthingApiKey: "sk_test",
      emitReceivedCallbacks: true,
    },
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    registerHttpRoute: vi.fn(({ path, handler }: { path: string; handler: RouteHandler }) => {
      routes.set(path, handler);
    }),
    on: vi.fn((hookName: string, handler: HookHandler) => {
      hooks[hookName] = handler;
    }),
  };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    routes.clear();
    for (const key of Object.keys(hooks)) delete hooks[key];
    api.pluginConfig = {
      kanbanthingBaseUrl: "http://localhost:3000",
      kanbanthingApiKey: "sk_test",
      emitReceivedCallbacks: true,
    };
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    ) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("registers capabilities/cancel routes and lifecycle hooks", () => {
    register(api);

    expect(api.registerHttpRoute).toHaveBeenCalledTimes(2);
    expect(routes.has("/kanbanthing/capabilities")).toBe(true);
    expect(routes.has("/kanbanthing/dispatch/cancel")).toBe(true);
    expect(api.on).toHaveBeenCalledWith("message_received", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("subagent_spawning", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("before_tool_call", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("after_tool_call", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("subagent_spawned", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("subagent_ended", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(api.on).toHaveBeenCalledWith("session_end", expect.any(Function));
  });

  it("serves capabilities from HTTP route", async () => {
    register(api);
    const handler = routes.get("/kanbanthing/capabilities");
    expect(handler).toBeDefined();

    const res = makeRes();
    await handler!(makeReq({ method: "GET" }), res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      ok: true,
      pluginId: "kanbanthing-dispatch-protocol",
      protocolVersion: 1,
      supportsCallbacks: true,
      supportsCancel: true,
      cancelMode: "enforced",
      supportsCancelAck: true,
      supportsCancelResult: true,
      supportsCancellationEnforcement: true,
      hardKillMode: "off",
      supportsProgressEvents: true,
    });
  });

  it("emits dispatch.received callback when KanbanThing dispatch metadata is received", async () => {
    register(api);

    const message = `KanbanThing dispatch: 1 tickets\n\nDispatch metadata (machine-readable):\n\`\`\`json\n${JSON.stringify(
      {
        kanbanthing_dispatch_v: 1,
        workspaceId: "ws_123",
        workspaceName: "Demo",
        ticketCount: 1,
        tickets: [{ id: "ticket_1", number: 1, title: "Test" }],
      },
      null,
      2
    )}\n\`\`\`\n`;

    await hooks.message_received(
      { content: message },
      { channelId: "slack", accountId: "acc_1", conversationId: "C123" }
    );

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/openclaw/dispatch-events");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-api-key": "sk_test",
    });
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      workspaceId: "ws_123",
      event: "dispatch.received",
      ticketIds: ["ticket_1"],
      message: "OpenClaw gateway received KanbanThing dispatch message.",
      metadata: {
        kanbanthingDispatchVersion: 1,
        workspaceName: "Demo",
        ticketCount: 1,
        channelId: "slack",
        accountId: "acc_1",
        conversationId: "C123",
      },
    });
    expect(typeof payload.eventId).toBe("string");
    expect(typeof payload.dispatchId).toBe("string");
  });

  it("dedupes repeated identical dispatch.received callbacks", async () => {
    register(api);
    const message = `Dispatch metadata (machine-readable):\n\`\`\`json\n${JSON.stringify({
      kanbanthing_dispatch_v: 1,
      workspaceId: "ws_dedupe",
      tickets: [{ id: "ticket_dedupe" }],
    })}\n\`\`\``;

    await hooks.message_received(
      { content: message },
      { channelId: "slack", conversationId: "CDEDUPE" }
    );
    await hooks.message_received(
      { content: message },
      { channelId: "slack", conversationId: "CDEDUPE" }
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("emits dispatch.started and dispatch.finished callbacks from subagent lifecycle hooks", async () => {
    register(api);
    const message = `Dispatch metadata (machine-readable):\n\`\`\`json\n${JSON.stringify({
      kanbanthing_dispatch_v: 1,
      workspaceId: "ws_lifecycle",
      workspaceName: "Lifecycle",
      tickets: [{ id: "ticket_lifecycle" }],
    })}\n\`\`\``;

    await hooks.message_received(
      { content: message },
      { channelId: "slack", conversationId: "CLIFE" }
    );
    await hooks.subagent_spawned(
      {
        runId: "run_life_1",
        mode: "run",
        requester: { channel: "slack", to: "CLIFE" },
      },
      {}
    );
    await hooks.subagent_ended(
      {
        runId: "run_life_1",
        outcome: "ok",
        reason: "done",
        targetKind: "subagent",
      },
      {}
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    const callbackEvents = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)).event);
    expect(callbackEvents).toEqual([
      "dispatch.received",
      "dispatch.started",
      "dispatch.finished",
    ]);
  });

  it("accepts cancel requests and emits dispatch.cancel_ack callback", async () => {
    register(api);
    const handler = routes.get("/kanbanthing/dispatch/cancel");
    expect(handler).toBeDefined();

    const res = makeRes();
    await handler!(
      makeReq({
        method: "POST",
        bodyText: JSON.stringify({
          workspaceId: "ws_cancel",
          dispatchId: "dispatch:abc",
          runId: "run_cancel_1",
          ticketIds: ["ticket_1"],
        }),
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      ok: true,
      accepted: true,
      cancelMode: "enforced",
    });

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      workspaceId: "ws_cancel",
      event: "dispatch.cancel_ack",
      dispatchId: "dispatch:abc",
      runId: "run_cancel_1",
      ticketIds: ["ticket_1"],
      metadata: {
        cancelMode: "enforced",
        pluginId: "kanbanthing-dispatch-protocol",
      },
    });
  });

  it("emits dispatch.cancel_result (too_late_to_cancel) if a run starts after cancel was requested", async () => {
    register(api);

    const message = `Dispatch metadata (machine-readable):\n\`\`\`json\n${JSON.stringify({
      kanbanthing_dispatch_v: 1,
      workspaceId: "ws_cancel_late",
      tickets: [{ id: "ticket_cancel_late" }],
    })}\n\`\`\``;

    await hooks.message_received(
      { content: message },
      { channelId: "slack", conversationId: "CCANCEL" }
    );

    const receivedPayload = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)
    );
    const handler = routes.get("/kanbanthing/dispatch/cancel");
    expect(handler).toBeDefined();

    const res = makeRes();
    await handler!(
      makeReq({
        method: "POST",
        bodyText: JSON.stringify({
          workspaceId: "ws_cancel_late",
          dispatchId: receivedPayload.dispatchId,
          ticketIds: ["ticket_cancel_late"],
        }),
      }),
      res
    );

    await hooks.subagent_spawned(
      {
        runId: "run_cancel_late_1",
        requester: { channel: "slack", to: "CCANCEL" },
      },
      {}
    );

    const callbackEvents = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)).event);
    expect(callbackEvents).toEqual([
      "dispatch.received",
      "dispatch.cancel_ack",
      "dispatch.started",
      "dispatch.cancel_result",
    ]);

    const cancelResultPayload = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[3]?.[1]?.body)
    );
    expect(cancelResultPayload).toMatchObject({
      event: "dispatch.cancel_result",
      workspaceId: "ws_cancel_late",
      runId: "run_cancel_late_1",
      ticketIds: ["ticket_cancel_late"],
      metadata: {
        result: "too_late_to_cancel",
        cancelMode: "enforced",
      },
    });
  });

  it("blocks subagent spawn when cancel was requested before spawn and emits cancelled result", async () => {
    register(api);

    const message = `Dispatch metadata (machine-readable):\n\`\`\`json\n${JSON.stringify({
      kanbanthing_dispatch_v: 1,
      workspaceId: "ws_cancel_block",
      tickets: [{ id: "ticket_cancel_block" }],
    })}\n\`\`\``;

    await hooks.message_received(
      { content: message },
      { channelId: "slack", conversationId: "CBLOCK" }
    );
    const receivedPayload = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)
    );

    const cancelHandler = routes.get("/kanbanthing/dispatch/cancel");
    const cancelRes = makeRes();
    await cancelHandler!(
      makeReq({
        method: "POST",
        bodyText: JSON.stringify({
          workspaceId: "ws_cancel_block",
          dispatchId: receivedPayload.dispatchId,
          ticketIds: ["ticket_cancel_block"],
        }),
      }),
      cancelRes
    );

    const spawnResult = await hooks.subagent_spawning(
      {
        childSessionKey: "sess_child_1",
        agentId: "main",
        mode: "run",
        requester: { channel: "slack", to: "CBLOCK" },
        threadRequested: false,
      },
      {}
    );

    expect(spawnResult).toMatchObject({
      status: "error",
    });

    const callbackEvents = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)).event);
    expect(callbackEvents).toEqual([
      "dispatch.received",
      "dispatch.cancel_ack",
      "dispatch.cancel_result",
    ]);

    const cancelResultPayload = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[2]?.[1]?.body)
    );
    expect(cancelResultPayload).toMatchObject({
      event: "dispatch.cancel_result",
      workspaceId: "ws_cancel_block",
      ticketIds: ["ticket_cancel_block"],
      metadata: {
        result: "cancelled",
        reason: "blocked_before_spawn",
      },
    });
  });

  it("emits throttled ticket.progress callbacks from tool hooks", async () => {
    register(api);

    const message = `Dispatch metadata (machine-readable):\n\`\`\`json\n${JSON.stringify({
      kanbanthing_dispatch_v: 1,
      workspaceId: "ws_progress",
      tickets: [{ id: "ticket_progress_1" }],
    })}\n\`\`\``;

    await hooks.message_received(
      { content: message },
      { channelId: "slack", conversationId: "CPROG" }
    );
    await hooks.subagent_spawned(
      {
        runId: "run_prog_1",
        childSessionKey: "sess_prog_1",
        requester: { channel: "slack", to: "CPROG" },
      },
      {}
    );

    await hooks.before_tool_call(
      { toolName: "bash" },
      { sessionKey: "sess_prog_1", toolName: "bash" }
    );
    await hooks.before_tool_call(
      { toolName: "bash" },
      { sessionKey: "sess_prog_1", toolName: "bash" }
    );
    await hooks.after_tool_call(
      { toolName: "bash", durationMs: 1200 },
      { sessionKey: "sess_prog_1", toolName: "bash" }
    );

    const callbackPayloads = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    const progressPayloads = callbackPayloads.filter((payload) => payload.event === "ticket.progress");

    expect(progressPayloads).toHaveLength(2);
    expect(progressPayloads[0]).toMatchObject({
      workspaceId: "ws_progress",
      event: "ticket.progress",
      runId: "run_prog_1",
      ticketIds: ["ticket_progress_1"],
      metadata: {
        phase: "tool_start",
        toolName: "bash",
      },
    });
    expect(progressPayloads[1]).toMatchObject({
      workspaceId: "ws_progress",
      event: "ticket.progress",
      runId: "run_prog_1",
      ticketIds: ["ticket_progress_1"],
      metadata: {
        phase: "tool_end",
        toolName: "bash",
        durationMs: 1200,
      },
    });
  });

  it("emits ticket.blocked callback on tool error", async () => {
    register(api);

    const message = `Dispatch metadata (machine-readable):\n\`\`\`json\n${JSON.stringify({
      kanbanthing_dispatch_v: 1,
      workspaceId: "ws_blocked",
      tickets: [{ id: "ticket_blocked_1" }],
    })}\n\`\`\``;

    await hooks.message_received(
      { content: message },
      { channelId: "slack", conversationId: "CBLOCKEDTOOL" }
    );
    await hooks.subagent_spawned(
      {
        runId: "run_blocked_1",
        childSessionKey: "sess_blocked_1",
        requester: { channel: "slack", to: "CBLOCKEDTOOL" },
      },
      {}
    );

    await hooks.after_tool_call(
      { toolName: "bash", error: "command failed", durationMs: 250 },
      { sessionKey: "sess_blocked_1", toolName: "bash" }
    );

    const payloads = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    const blockedPayload = payloads.find((p) => p.event === "ticket.blocked");

    expect(blockedPayload).toMatchObject({
      workspaceId: "ws_blocked",
      event: "ticket.blocked",
      runId: "run_blocked_1",
      ticketIds: ["ticket_blocked_1"],
      message: "Tool blocked: bash",
      metadata: {
        toolName: "bash",
        error: "command failed",
      },
    });
  });

  it("uses session_start/session_end mapping for deterministic hard-kill abort target", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "kt-openclaw-plugin-"));
    const internalApiFile = path.join(tempDir, "pi-embedded-test.mjs");
    writeFileSync(
      internalApiFile,
      [
        "globalThis.__ktAbortCalls = globalThis.__ktAbortCalls || [];",
        "globalThis.__ktStopCalls = globalThis.__ktStopCalls || [];",
        "export function abortEmbeddedPiRun(sessionId) {",
        "  globalThis.__ktAbortCalls.push(sessionId);",
        "  return sessionId === 'sid_det_1';",
        "}",
        "export function queueEmbeddedPiMessage(sessionId, text) {",
        "  globalThis.__ktStopCalls.push({ sessionId, text });",
        "  return false;",
        "}",
      ].join("\n"),
      "utf8"
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__ktAbortCalls = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__ktStopCalls = [];

    api.pluginConfig = {
      ...api.pluginConfig,
      hardKillMode: "internal_api",
      internalApiPathHint: internalApiFile,
    };

    register(api);

    const message = `Dispatch metadata (machine-readable):\n\`\`\`json\n${JSON.stringify({
      kanbanthing_dispatch_v: 1,
      workspaceId: "ws_detkill",
      tickets: [{ id: "ticket_detkill_1" }],
    })}\n\`\`\``;

    await hooks.message_received(
      { content: message },
      { channelId: "slack", conversationId: "CDET" }
    );

    const receivedPayload = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)
    );

    await hooks.subagent_spawned(
      {
        runId: "run_det_1",
        childSessionKey: "sess_det_1",
        requester: { channel: "slack", to: "CDET" },
      },
      {}
    );

    await hooks.session_start(
      { sessionId: "sid_det_1", sessionKey: "sess_det_1" },
      { sessionId: "sid_det_1", sessionKey: "sess_det_1" }
    );

    const cancelHandler = routes.get("/kanbanthing/dispatch/cancel");
    const cancelRes = makeRes();
    await cancelHandler!(
      makeReq({
        method: "POST",
        bodyText: JSON.stringify({
          workspaceId: "ws_detkill",
          dispatchId: receivedPayload.dispatchId,
          ticketIds: ["ticket_detkill_1"],
        }),
      }),
      cancelRes
    );

    expect(cancelRes.statusCode).toBe(200);
    const payloads = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    const cancelAck = payloads.find((p) => p.event === "dispatch.cancel_ack");
    expect(cancelAck).toMatchObject({
      event: "dispatch.cancel_ack",
      workspaceId: "ws_detkill",
      metadata: {
        cancelMode: "deterministic_hard_kill",
        hardKillAttempt: {
          mode: "internal_api",
          attempted: true,
          sessionsConsidered: 1,
          sessionsResolvedToSessionId: 1,
          abortCallsSucceeded: 1,
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((globalThis as any).__ktAbortCalls).toEqual(["sid_det_1"]);

    await hooks.session_end(
      { sessionId: "sid_det_1", sessionKey: "sess_det_1" },
      { sessionId: "sid_det_1", sessionKey: "sess_det_1" }
    );

    const cancelRes2 = makeRes();
    await cancelHandler!(
      makeReq({
        method: "POST",
        bodyText: JSON.stringify({
          workspaceId: "ws_detkill",
          dispatchId: receivedPayload.dispatchId,
          ticketIds: ["ticket_detkill_1"],
        }),
      }),
      cancelRes2
    );

    const payloads2 = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    const lastCancelAck = payloads2.filter((p) => p.event === "dispatch.cancel_ack").at(-1);
    expect(lastCancelAck?.metadata?.hardKillAttempt?.sessionsResolvedToSessionId).toBe(0);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
