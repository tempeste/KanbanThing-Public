---
name: kanbanthing
description: KanbanThing board operations for software agents. Use when you need to read workspace docs, find tasks, claim work, post progress, complete tickets, or call the KanbanThing REST API with workspace-scoped API keys.
---

# KanbanThing Skill

Follow this workflow when working in a project connected to KanbanThing.

## Setup

### 1. Load credentials from `.kanbanthing`

Before using env vars, check for a `.kanbanthing` file in the project root. It contains the API key and base URL:

```bash
# Read config from dotfile
KANBANTHING_API_KEY=$(grep KANBANTHING_API_KEY .kanbanthing | cut -d= -f2)
KANBANTHING_URL=$(grep KANBANTHING_BASE_URL .kanbanthing | cut -d= -f2)
```

**Important:** The config file may use `KANBANTHING_BASE_URL` (not `KANBANTHING_URL`). Normalize to `KANBANTHING_URL` when extracting.

### 2. Resolve the base URL

- **Hosted instance:** `https://your-deployment-url` — use as-is.
- **Local dev (`localhost:3000`):** The server typically runs plain HTTP even if the config says `https`. If you get TLS/SSL errors, switch the scheme to `http://`. Try `http://` first for localhost URLs.

### 3. Fallback: env vars

If no `.kanbanthing` file exists, use these env vars (or pass inline with curl):
- `KANBANTHING_API_KEY` — workspace-scoped API key (`sk_...`)
- `KANBANTHING_URL` — base URL

## Core Sequence

1. Parse `.kanbanthing` for credentials (see Setup above). Verify connectivity with a quick `GET /api/workspace/docs` call.
2. Get board overview with `GET /api/tickets` (no status filter) to understand the full picture — epics, sub-tickets, priorities, and what's already in progress.
3. Find claimable work with `GET /api/tickets?status=unclaimed`.
4. Claim exactly one ticket with `POST /api/tickets/<ticket-id>/claim`.
5. Execute the requested code changes in the repository.
6. Add progress notes or comments for visibility when needed.
7. Complete the ticket with `POST /api/tickets/<ticket-id>/complete`.

## Status Flow

`backlog → unclaimed → in_progress → done`

- **backlog**: Idea-phase tickets. Agents cannot claim backlog tickets directly — promote to unclaimed first.
- **unclaimed**: Ready for work. Agents claim from here.
- **in_progress**: Actively being worked on (auto-set by claim).
- **done**: Completed (auto-set by complete).

Non-standard transitions (e.g. `unclaimed → backlog`) require a `reason` field when called by agents.

## Tags

Tickets can have workspace-scoped tags (user-defined, with colors). Use `GET /api/tags` to list, and include tag IDs in `PATCH /api/tickets/:id` via the `tags` array field.

## Operational Rules

- Claim only tickets you are actively working on.
- Do not mark a ticket complete unless requested behavior is implemented and validated.
- If blocked, leave a short, concrete blocker update before unclaiming or stopping.
- Use REST calls (curl or HTTP client) with `X-API-Key` auth headers.

## References

- API details and curl examples: `references/api.md`
- Execution guidance and guardrails: `references/workflow.md`
