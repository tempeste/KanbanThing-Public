# KanbanThing Dispatch Protocol Plugin (OpenClaw)

OpenClaw plugin for KanbanThing dispatch lifecycle callbacks, cancellation control, progress mini-updates, and cancellation enforcement hooks.

This plugin is intended to be installed into a self-hosted OpenClaw instance while the source of truth lives in the KanbanThing repo.

## What it does

- Sends KanbanThing callbacks when a dispatch is received/started/finished/failed
- Accepts cancellation requests over HTTP (`POST /kanbanthing/dispatch/cancel`)
- Sends cancellation ACK/result callbacks (`dispatch.cancel_ack`, `dispatch.cancel_result`)
- Enforces cancellation in OpenClaw hooks (blocks subagent spawn and tool calls when cancellation is active)
- Emits throttled `ticket.progress` callbacks from tool hooks for mini activity updates
- Optionally attempts best-effort hard-kill behavior (limitation-aware)

## Install (local linked plugin)

From the machine running OpenClaw:

```bash
openclaw plugins install -l /path/to/kanbanThing/openclaw/plugins/kanbanthing-dispatch-protocol
openclaw plugins enable kanbanthing-dispatch-protocol
```

Restart OpenClaw after enabling the plugin.

## Plugin Files

- `openclaw.plugin.json` — manifest + config schema
- `index.ts` — plugin implementation

## Required Config

Provide one of:

- Explicit workspace routing in plugin config: `kanbanthingTargets[]`
- Repo-mapped credentials (recommended for per-repo API keys): `workspaceMappingFile`

Multi-target example (strict routing by `workspaceId`, no default fallback):

```json
{
  "plugins": {
    "entries": {
      "kanbanthing-dispatch-protocol": {
        "enabled": true,
        "config": {
          "kanbanthingTargets": [
            {
              "id": "local-dev",
              "kanbanthingBaseUrl": "http://127.0.0.1:3000",
              "kanbanthingApiKey": "sk_local_...",
              "workspaceIds": ["ws_local_123"]
            },
            {
              "id": "hosted",
              "kanbanthingBaseUrl": "https://kanban.example.test",
              "kanbanthingApiKey": "sk_prod_...",
              "workspaceIds": ["ws_prod_abc", "ws_prod_xyz"]
            }
          ],
          "callbackPath": "/api/openclaw/dispatch-events",
          "emitReceivedCallbacks": true,
          "enforceCancellation": true,
          "emitProgressEvents": true
        }
      }
    }
  }
}
```

Mapping-file example (workspace -> repo dir -> `.kanbanthing` / `.env.local` / `.env`):

```json
{
  "plugins": {
    "entries": {
      "kanbanthing-dispatch-protocol": {
        "enabled": true,
        "config": {
          "workspaceMappingFile": "~/.openclaw/kanbanthing-workspaces.json",
          "callbackPath": "/api/openclaw/dispatch-events",
          "emitReceivedCallbacks": true,
          "enforceCancellation": true,
          "emitProgressEvents": true
        }
      }
    }
  }
}
```

## Config Options

- `kanbanthingTargets` (`array`, required in multi-target mode)
  - Per-instance callback targets. Each entry supports:
  - `kanbanthingBaseUrl` (`string`, required)
  - `kanbanthingApiKey` (`string`, required)
  - `workspaceIds` (`string[]`, optional)
  - `id` (`string`, optional, operator label)
  - `callbackPath` (`string`, optional, overrides global `callbackPath`)
  - Routing behavior:
  - If `workspaceId` matches an entry's `workspaceIds`, that target is used
  - If no match, callback is skipped and the plugin logs a warning (fail-closed)
- `workspaceMappingFile` (`string`, optional)
  - Path to a workspace mapping JSON (same shape used by the KanbanThing OpenClaw helper script)
  - Plugin resolves `workspaceId -> repo dir`, then loads credentials from repo-local `.kanbanthing`, `.env.local`, `.env`
  - Fail-closed: unmapped workspace, missing repo dir, or missing repo credentials skip callback with warning
- `callbackPath` (`string`, optional)
  - Defaults to `/api/openclaw/dispatch-events`
  - Applies to all targets unless overridden per `kanbanthingTargets[]` entry
  - Also used for `workspaceMappingFile` mode
- `pluginSecret` (`string`, optional)
  - If set, plugin HTTP routes require `x-kanbanthing-plugin-secret`
- `emitReceivedCallbacks` (`boolean`, optional, default `true`)
  - Emits `dispatch.received` from `message_received`
- `enforceCancellation` (`boolean`, optional, default `true`)
  - Enables cancellation enforcement hooks (`subagent_spawning`, `before_tool_call`)
- `emitProgressEvents` (`boolean`, optional, default `true`)
  - Enables throttled `ticket.progress` callbacks from tool hooks
- `hardKillMode` (`"off" | "best_effort" | "internal_api"`, optional, default `"off"`)
  - `off`: no hard-kill attempt
  - `best_effort`: try heuristic abort/`/stop` using internal APIs if available
  - `internal_api`: reserved/scaffolded mode (currently behaves as best-effort attempt path + enforcement)
- `internalApiPathHint` (`string`, optional)
  - Optional absolute path hint to OpenClaw internal dist module (`.../dist/agents/pi-embedded.js`) for best-effort hard-kill import attempts

## HTTP Endpoints (plugin side)

- `GET /kanbanthing/capabilities`
  - Returns protocol/capability info
- `POST /kanbanthing/dispatch/cancel`
  - Accepts cancellation request and emits `dispatch.cancel_ack`

If `pluginSecret` is configured, include:

```http
x-kanbanthing-plugin-secret: <secret>
```

## Callback Events (plugin -> KanbanThing)

Dispatch lifecycle:

- `dispatch.received`
- `dispatch.started`
- `dispatch.finished`
- `dispatch.failed`
- `dispatch.cancel_ack`
- `dispatch.cancel_result`

Ticket-level activity:

- `ticket.progress` (throttled)
- `ticket.blocked` (reserved for future richer callbacks)
- `ticket.failed` (reserved/future)
- `ticket.finished` (reserved/future)

## Cancellation Semantics

Recommended operator flow:

1. In KanbanThing, click `Cancel Dispatch`
2. Wait for:
   - `Cancel Ack` (plugin accepted request)
   - `Cancel Result` (`cancelled` or `too_late_to_cancel`)
3. If needed, use `Force Return to Unclaimed`

### Why not just move the ticket back?

Moving `dispatched -> unclaimed` before cancellation confirmation can create duplicate work if OpenClaw already received or started the dispatch.

## Hard-Kill Notes (Important)

The plugin now includes a **best-effort** hard-kill attempt path, but it is intentionally transparent about limitations.

Why it is not guaranteed:

- Plugin hooks expose `sessionKey` / `runId`
- Some OpenClaw internal abort APIs expect `sessionId`
- Those identifiers may not map cleanly in all runtimes

When the plugin attempts hard-kill, KanbanThing receives `hardKillAttempt` metadata in `dispatch.cancel_ack`, including:

- whether a hard-kill attempt was made
- how many session keys were considered
- abort calls that succeeded
- queued `/stop` fallback messages
- limitations/downgrade reason

Reliable safety still comes from:

- cancellation enforcement hooks (block future spawns/tool calls)
- explicit user-facing cancel/force-return workflow in KanbanThing

## Capabilities Endpoint

Use this to validate plugin installation and mode:

```bash
curl http://<openclaw-host>/plugins/http/kanbanthing/capabilities
```

Depending on your OpenClaw routing, the base prefix may differ; use the route path returned by OpenClaw plugin HTTP handler setup.

Key fields:

- `supportsCancel`
- `cancelMode` (`signal_only`, `enforced`, `best_effort_hard_kill`, `deterministic_hard_kill`)
- `supportsCancelAck`
- `supportsCancelResult`
- `supportsCancellationEnforcement`
- `supportsProgressEvents`
- `supportsHardKill`
- `hardKillMode`

## Operational Recommendations

- Start with:
  - `enforceCancellation=true`
  - `emitProgressEvents=true`
  - `hardKillMode="off"` or `"best_effort"`
- If your OpenClaw build exposes `sessionKey` in `session_start/session_end`, `hardKillMode="internal_api"` enables deterministic `sessionKey -> sessionId` abort targeting for tracked sessions (plugin still keeps enforcement hooks as fallback)
- For local+hosted setups with per-repo API keys, prefer `workspaceMappingFile` so the plugin resolves credentials from the correct repo
- If using `kanbanthingTargets[]`, explicitly assign every `workspaceId`; unmapped workspaces are skipped by design
- Turn on `pluginSecret` for non-local deployments
- Treat `best_effort` hard-kill as an optimization, not a guarantee
- Use KanbanThing execution badges + activity feed as the source of dispatch lifecycle visibility
