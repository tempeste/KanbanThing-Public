---
name: kanbanthing
description: KanbanThing board operations for software agents. Use when you need to read workspace docs, find tasks, claim work, post progress, complete tickets, or call the KanbanThing REST API with workspace-scoped API keys.
---

# KanbanThing Skill

Follow this workflow when working in a project connected to KanbanThing.

## Setup

Set these env vars (or pass inline with curl):
- `KANBANTHING_API_KEY` — workspace-scoped API key (`sk_...`)
- `KANBANTHING_URL` — base URL (default: `https://<your-kanbanthing-host>`)

## Core Sequence

1. Load project context with `GET /api/workspace/docs`.
2. Find available work with `GET /api/tickets?status=unclaimed`.
3. Claim exactly one ticket with `POST /api/tickets/<ticket-id>/claim`.
4. Execute the requested code changes in the repository.
5. Add progress notes or comments for visibility when needed.
6. Complete the ticket with `POST /api/tickets/<ticket-id>/complete`.

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
