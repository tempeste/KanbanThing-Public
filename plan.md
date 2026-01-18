# KanbanThing - LLM-Friendly Task Board

## Problem
- Linear/Jira require manual context passing to LLM agents (slow, tedious)
- Markdown-based ticket systems bloat repos and don't support parallel work
- No good middle ground for human-LLM collaborative task management

## Solution
A kanban system where both humans (via web UI) and LLM agents (via REST API) can view, claim, and complete tickets with real-time sync.

## Core Concepts
- **Workspaces**: Project-level isolation (agents only see their workspace)
- **Tickets**: Flexible format, any size (ralph-sized or larger)
- **Status flow**: `unclaimed` → `in_progress` → `done`
- **Free-for-all claiming**: Any user/agent can claim any unclaimed ticket

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Backend**: Convex (real-time sync, TypeScript)
- **UI**: shadcn/ui + Tailwind CSS
- **Tables**: TanStack Table (sortable/filterable ticket lists)
- **Agent API**: Next.js API routes (thin REST wrapper)
- **Auth**: Convex auth for humans, workspace-scoped API keys for agents

## Data Model

```
Workspace {
  id, name,
  docs?: string,          # Markdown - project overview, conventions, links
  createdAt
}

Ticket {
  id, workspaceId, title, description,
  docs?: string,          # Markdown - ticket-specific context/reference
  status: "unclaimed" | "in_progress" | "done",
  ownerId?, ownerType?: "user" | "agent",
  createdAt, updatedAt
}

ApiKey {
  id, workspaceId, keyHash, name, createdAt
}
```

**Docs Purpose**:
- Workspace docs: Project overview, codebase conventions, useful links, environment setup
- Ticket docs: Specific context, relevant files, acceptance criteria details, reference material

## MVP Features

### Phase 1: Foundation
1. Initialize repo with `init-repo.sh`
2. Create Next.js app with TypeScript
3. Set up Convex (`npx convex init`)
4. Initialize shadcn/ui (`npx shadcn-ui@latest init`)
5. Define Convex schema (workspaces, tickets, api_keys)
6. Basic Convex mutations: createTicket, claimTicket, updateStatus, updateDocs

### Phase 2: Web UI
7. Layout with sidebar (workspace list) + main content area
8. Workspace view with kanban columns (unclaimed, in_progress, done)
9. TanStack Table for ticket list view (sortable, filterable)
10. Create/edit ticket modal with markdown editor for docs
11. Workspace settings page with docs editor
12. Real-time updates via Convex subscriptions

### Phase 3: Agent API
13. REST endpoints: `GET /api/tickets`, `POST /api/tickets/:id/claim`, `POST /api/tickets/:id/complete`
14. `GET /api/workspace/docs` - fetch workspace context
15. `GET /api/tickets/:id/docs` - fetch ticket-specific context
16. API key middleware (validate key, scope to workspace)
17. Generate/manage API keys from web UI

## File Structure (Proposed)
```
kanbanThing/
├── convex/                    # Convex backend
│   ├── schema.ts
│   ├── tickets.ts
│   ├── workspaces.ts
│   └── apiKeys.ts
├── app/                       # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx
│   ├── workspace/[id]/
│   │   ├── page.tsx           # Kanban board view
│   │   └── settings/page.tsx  # Workspace docs & API keys
│   └── api/                   # REST API for agents
│       ├── tickets/route.ts
│       ├── tickets/[id]/
│       │   ├── claim/route.ts
│       │   └── complete/route.ts
│       └── workspace/docs/route.ts
├── components/                # React components
│   ├── ui/                    # shadcn components
│   ├── kanban-board.tsx
│   ├── ticket-table.tsx       # TanStack Table
│   ├── ticket-modal.tsx
│   └── docs-editor.tsx
├── lib/                       # Utilities
│   └── api-auth.ts            # API key validation
├── package.json
└── AGENTS.MD
```

## Agent Usage Example
```bash
# Get workspace context (project docs, conventions)
curl -H "X-API-Key: sk_..." https://kanban.example/api/workspace/docs

# List unclaimed tickets
curl -H "X-API-Key: sk_..." https://kanban.example/api/tickets?status=unclaimed

# Get ticket details including docs
curl -H "X-API-Key: sk_..." https://kanban.example/api/tickets/123

# Claim a ticket
curl -X POST -H "X-API-Key: sk_..." https://kanban.example/api/tickets/123/claim

# Mark complete
curl -X POST -H "X-API-Key: sk_..." https://kanban.example/api/tickets/123/complete
```

**Typical Agent Workflow**:
1. Fetch workspace docs to understand project context
2. List unclaimed tickets
3. Pick highest priority / best fit ticket
4. Claim it
5. Fetch ticket docs for specific context
6. Do the work
7. Mark complete

## Verification
1. Run `npm run dev` and verify frontend loads
2. Create a workspace and add workspace-level docs
3. Create a ticket with ticket-level docs
4. Test kanban drag-drop and table view switching
5. Generate an API key from workspace settings
6. Use curl to:
   - `GET /api/tickets` - list tickets
   - `GET /api/workspace/docs` - fetch workspace context
   - `POST /api/tickets/:id/claim` - claim a ticket
   - `POST /api/tickets/:id/complete` - mark done
7. Verify real-time sync (API changes reflect in UI immediately)

## Important References
- **Global agent config**: `~/thirdPartyRepos/agent-scripts/AGENTS.MD` - Contains workspace conventions, SSH key config, commit style (Conventional Commits), frontend aesthetics guidelines, and tool catalog
- The `init-repo.sh` script creates a local `AGENTS.MD` that points to this global config

## Implementation Steps
1. Read `~/thirdPartyRepos/agent-scripts/AGENTS.MD` for conventions
2. Run `/home/agentuser/thirdPartyRepos/agent-scripts/scripts/init-repo.sh`
2. Create Next.js app: `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false`
3. Set up Convex: `npx convex init`
4. Initialize shadcn: `npx shadcn@latest init`
5. Install TanStack Table: `npm install @tanstack/react-table`
6. Implement Convex schema and mutations
7. Build UI components
8. Add API routes
9. Test end-to-end
