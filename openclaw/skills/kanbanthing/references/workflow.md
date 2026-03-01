# KanbanThing Execution Workflow

## Standard Runbook

1. Read workspace docs first.
2. List unclaimed tickets and pick one aligned with the user request.
3. Claim that ticket before editing code.
4. Implement and validate changes in the repo.
5. Post a short progress update when work is non-trivial or blocked.
6. Complete the ticket only after validation succeeds.

## Same-Session Ticket Lifecycle

When you create tickets and implement fixes in the same session:

- Claim each ticket before starting its fix.
- Complete each ticket immediately after committing its fix.
- Do not leave tickets in `unclaimed` after the work is done.

## Validation Expectations

- Run repo-required checks before completion (typecheck/build/tests when requested by local policy).
- If checks cannot run, record exactly what was skipped and why.

## Status Flow

`backlog → unclaimed → in_progress → done`

- **backlog**: Idea-phase. Cannot be claimed. Promote to unclaimed first via `PATCH /api/tickets/:id` with `{"status":"unclaimed","reason":"..."}`.
- **unclaimed → in_progress**: Handled automatically by `POST /api/tickets/:id/claim`.
- **in_progress → done**: Handled automatically by `POST /api/tickets/:id/complete`.
- Non-standard transitions (skipping steps, going backwards) require a `reason` field for agent callers.

## Assignment and Status Notes

- Use claim/complete helpers when possible instead of manual status mutation.
- Avoid leaving tickets in `in_progress` if no active work is happening.
- Backlog tickets must be promoted to unclaimed before they can be claimed.

## Failure Handling

- If auth fails, verify API key scope and workspace.
- If claim fails, refresh ticket state first (another agent may have claimed it).
- If claim fails with "backlog" status, promote to unclaimed first.
- If completion fails due to validation, leave an explicit blocker note and stop.

## Agent Wizard Flow (No UI)

When an agent needs to configure OpenClaw workspace mapping without using Workspace Settings UI:

1. Inspect repo credentials and workspace metadata
2. Upsert mapping entry (dry-run first, then write)
3. Run mapping doctor verification

### Helper Script Path (preferred)

```bash
{baseDir}/scripts/kanbanthing.sh mapping add --auto --dry-run
{baseDir}/scripts/kanbanthing.sh mapping add --auto
{baseDir}/scripts/kanbanthing.sh mapping doctor
```

### Direct API Path (for custom agent flows)

These endpoints live on the **OpenClaw host** (plugin HTTP routes), not on KanbanThing.
Auth is via OpenClaw bearer token, not KanbanThing API key.

```bash
# Inspect
curl -sS -X POST \
  -H "Authorization: Bearer $OPENCLAW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoPath":"/abs/path/to/repo","workspaceId":"ws_..."}' \
  "${OPENCLAW_URL}/kanbanthing/workspace-mapping/inspect" | jq .

# Upsert (dry run)
curl -sS -X POST \
  -H "Authorization: Bearer $OPENCLAW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoPath":"/abs/path/to/repo","dryRun":true}' \
  "${OPENCLAW_URL}/kanbanthing/workspace-mapping/upsert" | jq .

# Upsert (write)
curl -sS -X POST \
  -H "Authorization: Bearer $OPENCLAW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoPath":"/abs/path/to/repo"}' \
  "${OPENCLAW_URL}/kanbanthing/workspace-mapping/upsert" | jq .

# Doctor
curl -sS \
  -H "Authorization: Bearer $OPENCLAW_TOKEN" \
  "${OPENCLAW_URL}/kanbanthing/workspace-mapping/doctor" | jq .
```

Note: The KanbanThing UI accesses these indirectly via Convex action proxies (Workspace Settings > OpenClaw Repo Mapping Wizard). Agents should prefer the helper script's `mapping` subcommands.
