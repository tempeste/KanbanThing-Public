---
name: kanbanthing
description: Manage KanbanThing tickets via the KanbanThing REST API from OpenClaw. Curl-first docs with optional helper script for deterministic workspace routing.
homepage: https://github.com/tempeste/KanbanThing-Public
metadata:
  {
    "openclaw":
      { "emoji": "🗂️", "requires": { "bins": ["curl", "jq", "bash"] } },
  }
---

# KanbanThing Skill (OpenClaw)

Use this skill to interact with KanbanThing workspaces from OpenClaw agents.

This skill is meant to be copied into an OpenClaw workspace (or `~/.openclaw/skills`) and does **not** require ClawHub publishing.

## Install (copy into OpenClaw)

OpenClaw loads workspace skills from `<workspace>/skills`.

```bash
mkdir -p /path/to/openclaw-workspace/skills
cp -R /path/to/KanbanThing-Public/openclaw/skills/kanbanthing /path/to/openclaw-workspace/skills/
```

Start a new OpenClaw session after copying (skills are loaded per session).

## Routing Model (Recommended)

KanbanThing API keys are **workspace-scoped**. Do not rely on a single global key for all workspaces.

Instead, maintain a local mapping file that tells OpenClaw which local project directory corresponds to which KanbanThing workspace ID.

Default mapping file path:

```bash
~/.openclaw/kanbanthing-workspaces.json
```

Recommended schema (ID for identity, alias for ergonomics):

```json
{
  "workspaces": {
    "kanbanthing-private": {
      "workspaceId": "your-workspace-id-here",
      "dir": "/path/to/your/kanbanthing-private-repo",
      "envFiles": [".env.local", ".env"]
    },
    "kanbanthing-public": {
      "workspaceId": "another-workspace-id",
      "dir": "/path/to/your/kanbanthing-public-repo",
      "envFiles": [".env.local", ".env"]
    }
  }
}
```

Notes:

- `workspaceId` is the stable identifier.
- `dir` points to the local repo containing the workspace-scoped API key.
- Credential resolution order: `.kanbanthing` (highest priority), then `envFiles` (defaults to `[".env.local", ".env"]`).
- `envFiles` is optional; the plugin always checks `.kanbanthing` first regardless of this setting.

## Dispatch Message Metadata (Important)

KanbanThing dispatch messages to OpenClaw include a machine-readable JSON block in the text message with:

- `kanbanthing_dispatch_v`
- `workspaceId`
- `workspaceName`
- ticket IDs/numbers

Use `workspaceId` from that block to resolve the correct local directory/key from your mapping.

Version handling:

- This skill currently expects `kanbanthing_dispatch_v = 1`.
- If you see an unknown version, do **not** assume the JSON shape. Fall back to the human-readable dispatch text and re-fetch data from the KanbanThing API (`ticket-get`, `tickets-list`) before taking action.

Metadata size note:

- The machine-readable `tickets` list may be truncated for large batches.
- Check `ticketCount`, `metadataTicketCount`, and `metadataTruncated`.
- The human-readable ticket list below the JSON block remains the full list.

## Curl-First Workflow (Primary)

If the agent is already running inside the correct project directory (or the runtime exports the env vars), use direct `curl`.

Required auth header:

```bash
-H "X-API-Key: $KANBANTHING_API_KEY"
```

Base URL:

```bash
${KANBANTHING_API_URL:-$KANBANTHING_URL}
```

### Core sequence

1. Read workspace docs

```bash
curl -sS -H "X-API-Key: $KANBANTHING_API_KEY" \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/workspace/docs" | jq .
```

2. List unclaimed tickets

```bash
curl -sS -H "X-API-Key: $KANBANTHING_API_KEY" \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/tickets?status=unclaimed&fields=summary" | jq .
```

3. Get one ticket

```bash
curl -sS -H "X-API-Key: $KANBANTHING_API_KEY" \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/tickets/<ticket-id>" | jq .
```

4. Claim it

```bash
curl -sS -X POST -H "X-API-Key: $KANBANTHING_API_KEY" \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/tickets/<ticket-id>/claim" | jq .
```

5. Update status (if needed)

```bash
curl -sS -X POST \
  -H "X-API-Key: $KANBANTHING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/tickets/<ticket-id>/status" | jq .
```

Non-standard transitions require `reason`:

```bash
curl -sS -X POST \
  -H "X-API-Key: $KANBANTHING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"backlog","reason":"Blocked on dependency"}' \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/tickets/<ticket-id>/status" | jq .
```

6. Add a comment

```bash
curl -sS -X POST \
  -H "X-API-Key: $KANBANTHING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"Starting implementation now"}' \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/tickets/<ticket-id>/comments" | jq .
```

7. Complete the ticket

```bash
curl -sS -X POST -H "X-API-Key: $KANBANTHING_API_KEY" \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/tickets/<ticket-id>/complete" | jq .
```

### Generic ticket PATCH (title/description/priority/tags/archived/status)

```bash
curl -sS -X PATCH \
  -H "X-API-Key: $KANBANTHING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"priority":"high"}' \
  "${KANBANTHING_API_URL:-$KANBANTHING_URL}/api/tickets/<ticket-id>" | jq .
```

## Optional Helper Script (Deterministic Routing + Convenience)

This skill includes an optional wrapper script:

```bash
{baseDir}/scripts/kanbanthing.sh
```

`{baseDir}` means the installed skill directory, for example:

- `~/.openclaw/skills/kanbanthing`
- `<openclaw-workspace>/skills/kanbanthing`

Use it when you want:

- consistent error handling/timeouts
- mapping-based workspace routing (`workspaceId` / alias -> local dir -> `.env`)
- simpler command surface for repetitive calls
- mapping wizard helpers (`mapping add`, `mapping doctor`, `mapping list`)

### Helper script routing modes

The helper can resolve credentials/base URL via:

1. `--workspace <alias>` (from mapping file)
2. `--workspace-id <id>` (best for dispatch metadata)
3. current working directory match against mapping `dir`
4. fallback local `.env` / `.env.local` in current directory

When `--workspace` or `--workspace-id` is provided, the helper fails closed if mapping resolution fails.

Retry behavior:

- The helper does not automatically retry state-changing requests (`claim`, `complete`, `status`, `comment`, `update`).
- If a network error happens during a mutating call, re-check ticket state with `ticket-get` before retrying.
- Read-only calls (`workspace-docs`, `tickets-list`, `ticket-get`) can usually be retried safely.

### Helper examples

```bash
# Add/update mapping for current repo (wizard-friendly)
{baseDir}/scripts/kanbanthing.sh mapping add --auto

# Dry-run mapping update without writing
{baseDir}/scripts/kanbanthing.sh mapping add --auto --dry-run

# Verify mapping health and issue codes
{baseDir}/scripts/kanbanthing.sh mapping doctor

# List known mapping entries
{baseDir}/scripts/kanbanthing.sh mapping list

# Inspect resolved routing/env (shows alias/workspaceId/dir if mapping matched)
{baseDir}/scripts/kanbanthing.sh --workspace-id <workspace-id> doctor

# Workspace docs
{baseDir}/scripts/kanbanthing.sh --workspace kanbanthing-private workspace-docs

# List unclaimed
{baseDir}/scripts/kanbanthing.sh --workspace-id <workspace-id> tickets-list --status unclaimed --fields summary

# Claim / comment / complete
{baseDir}/scripts/kanbanthing.sh --workspace-id <workspace-id> ticket-claim <ticket-id>
{baseDir}/scripts/kanbanthing.sh --workspace-id <workspace-id> ticket-comment <ticket-id> "Working on this now"
{baseDir}/scripts/kanbanthing.sh --workspace-id <workspace-id> ticket-complete <ticket-id>

# Generic patch
{baseDir}/scripts/kanbanthing.sh --workspace-id <workspace-id> ticket-update <ticket-id> --json '{"priority":"medium"}'
```

## Duplicate Dispatch Handling (Important)

KanbanThing dispatch to OpenClaw may rarely duplicate instructions due to upstream retries.

Agents must handle this gracefully:

- Check the ticket status before starting work.
- `claim` fails safely if the ticket is no longer `unclaimed`.
- If another agent already claimed it, skip without crashing.

## Notes

- This skill is AgentSkills-compatible (`SKILL.md` + optional `scripts/` helpers).
- It is safe for multi-subagent usage because routing is explicit (`workspaceId`) and keys stay workspace-scoped.
- For dispatch cancellation semantics (`dispatch.cancel_ack` / `hardKillAttempt`), see `references/workflow.md` ("Dispatch Cancellation Telemetry").
