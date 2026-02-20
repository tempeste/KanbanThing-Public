# KanbanThing Execution Workflow

## Standard Runbook

1. Read workspace docs first.
2. List unclaimed tickets and pick one aligned with the user request.
3. Claim that ticket before editing code.
4. Implement and validate changes in the repo.
5. Post a short progress update when work is non-trivial or blocked.
6. Complete the ticket only after validation succeeds.

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
