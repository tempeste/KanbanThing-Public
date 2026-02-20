# KanbanThing API Reference

All requests require `X-API-Key: sk_...` header.

## Base URL

- Local dev: `http://localhost:3000`
- Hosted: your KanbanThing deployment URL (e.g. `https://your-deployment-url`)

## Workspace Docs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/workspace/docs` | Get workspace docs (markdown context) |
| `PATCH` | `/api/workspace/docs` | Update workspace docs |
| `GET` | `/api/workspace/docs/history` | Get docs revision history |

## Tickets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tickets` | List tickets |
| `POST` | `/api/tickets` | Create ticket |
| `GET` | `/api/tickets/:id` | Get single ticket |
| `PATCH` | `/api/tickets/:id` | Update ticket fields (title, description, priority, tags, status, etc.) |
| `DELETE` | `/api/tickets/:id` | Delete ticket (admin key required) |
| `POST` | `/api/tickets/:id/claim` | Claim an unclaimed ticket (sets in_progress + assigns agent) |
| `POST` | `/api/tickets/:id/complete` | Mark ticket done |
| `POST` | `/api/tickets/:id/status` | Change status with optional order/reason |
| `POST` | `/api/tickets/:id/assign` | Assign owner |
| `POST` | `/api/tickets/:id/unassign` | Remove owner |
| `POST` | `/api/tickets/:id/comments` | Add a comment |
| `GET` | `/api/tickets/:id/activity` | Get activity log |
| `GET` | `/api/tickets/export` | Export all tickets (`?format=json` or `?format=csv`) |
| `POST` | `/api/tickets/bulk` | Bulk operations (archive/unarchive/delete) |

### GET /api/tickets query params

- `status` — filter by status: `backlog`, `unclaimed`, `in_progress`, `done`
- `parentId` — filter by parent (use `root` or `null` for top-level)
- `fields` — `full` (default) or `summary` (lighter payload)
- `limit` — max results (1-500)

### POST /api/tickets body

```json
{ "title": "...", "description": "...", "priority": "none|low|medium|high|urgent", "status": "backlog|unclaimed", "parentId": "..." }
```

Only `title` is required. `status` defaults to `unclaimed`. Use `backlog` for idea-phase tickets.

### PATCH /api/tickets/:id body

```json
{ "title": "...", "description": "...", "priority": "...", "tags": ["tag-id-1", "tag-id-2"], "status": "backlog|unclaimed|in_progress|done", "reason": "...", "archived": false, "order": 123, "parentId": "..." }
```

All fields optional. `status` uses the `updateStatus` mutation — non-standard transitions require `reason` for agent callers.

### POST /api/tickets/:id/status body

```json
{ "status": "backlog|unclaimed|in_progress|done", "reason": "...", "order": 123 }
```

`reason` required for non-standard transitions by agents. `order` optional (sets position in column).

### POST /api/tickets/bulk body

```json
{ "action": "archive|unarchive|delete", "ids": ["id1", "id2"] }
```

Max 100 IDs. Delete requires admin key.

## Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tags` | List workspace tags |
| `POST` | `/api/tags` | Create tag |
| `PATCH` | `/api/tags/:id` | Update tag name/color |
| `DELETE` | `/api/tags/:id` | Delete tag (also removes from all tickets) |

### POST /api/tags body

```json
{ "name": "bug", "color": "#ef4444" }
```

### PATCH /api/tags/:id body

```json
{ "name": "...", "color": "..." }
```

Both optional. Tag names must be unique per workspace.

## API Key Management (Admin Key Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/api-keys` | List API keys |
| `POST` | `/api/api-keys` | Create API key |
| `DELETE` | `/api/api-keys/:id` | Revoke API key |

## curl Examples

```bash
# Workspace docs
curl -H "X-API-Key: $KANBANTHING_API_KEY" "$KANBANTHING_URL/api/workspace/docs"

# List unclaimed tickets
curl -H "X-API-Key: $KANBANTHING_API_KEY" "$KANBANTHING_URL/api/tickets?status=unclaimed"

# Claim a ticket
curl -X POST -H "X-API-Key: $KANBANTHING_API_KEY" "$KANBANTHING_URL/api/tickets/$ID/claim"

# Complete a ticket
curl -X POST -H "X-API-Key: $KANBANTHING_API_KEY" "$KANBANTHING_URL/api/tickets/$ID/complete"

# Create a backlog ticket
curl -X POST -H "X-API-Key: $KANBANTHING_API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"My idea","status":"backlog"}' "$KANBANTHING_URL/api/tickets"

# Update ticket with tags and status
curl -X PATCH -H "X-API-Key: $KANBANTHING_API_KEY" -H "Content-Type: application/json" \
  -d '{"tags":["tag-id"],"status":"backlog","reason":"Moving to backlog"}' \
  "$KANBANTHING_URL/api/tickets/$ID"

# List tags
curl -H "X-API-Key: $KANBANTHING_API_KEY" "$KANBANTHING_URL/api/tags"

# Create a tag
curl -X POST -H "X-API-Key: $KANBANTHING_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"bug","color":"#ef4444"}' "$KANBANTHING_URL/api/tags"

# Export as JSON
curl -H "X-API-Key: $KANBANTHING_API_KEY" "$KANBANTHING_URL/api/tickets/export?format=json"

# Bulk archive
curl -X POST -H "X-API-Key: $KANBANTHING_API_KEY" -H "Content-Type: application/json" \
  -d '{"action":"archive","ids":["id1","id2"]}' "$KANBANTHING_URL/api/tickets/bulk"
```
