# KanbanThing API Reference

Use `X-API-Key` on all requests.

## Base URL

- Local dev: `http://localhost:3000`
- Hosted: your KanbanThing deployment URL

## Workspace Docs

- `GET /api/workspace/docs`
- `PATCH /api/workspace/docs`
- `GET /api/workspace/docs/history`

## Tickets

- `GET /api/tickets`
- `POST /api/tickets`
- `GET /api/tickets/:id`
- `PATCH /api/tickets/:id`
- `POST /api/tickets/:id/claim`
- `POST /api/tickets/:id/complete`
- `POST /api/tickets/:id/status`
- `POST /api/tickets/:id/assign`
- `POST /api/tickets/:id/unassign`
- `POST /api/tickets/:id/comments`
- `GET /api/tickets/:id/activity`

## API Key Management (Admin Key Required)

- `GET /api/api-keys`
- `POST /api/api-keys`
- `DELETE /api/api-keys/:id`

## Minimal curl Examples

```bash
# Docs
curl -H "X-API-Key: sk_..." "$KANBANTHING_URL/api/workspace/docs"

# Unclaimed tickets
curl -H "X-API-Key: sk_..." "$KANBANTHING_URL/api/tickets?status=unclaimed"

# Claim ticket
curl -X POST -H "X-API-Key: sk_..." "$KANBANTHING_URL/api/tickets/$TICKET_ID/claim"

# Complete ticket
curl -X POST -H "X-API-Key: sk_..." "$KANBANTHING_URL/api/tickets/$TICKET_ID/complete"
```
