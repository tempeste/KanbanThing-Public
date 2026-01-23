# KanbanThing - LLM-Friendly Task Board

## Problem
- Linear/Jira require manual context passing to LLM agents (slow, tedious)
- Markdown-based issue systems bloat repos and don't support parallel work
- No good middle ground for human-LLM collaborative task management

## Solution
A kanban system where both humans (via web UI) and LLM agents (via REST API) can view, claim, and complete issues with real-time sync.

## Core Concepts
- **Workspaces**: Project-level isolation (agents only see their workspace)
- **Issues**: Flexible format, any size (ralph-sized or larger)
- **Status flow**: `unclaimed` → `in_progress` → `done`
- **Free-for-all claiming**: Any user/agent can claim any unclaimed issue

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Backend**: Convex (real-time sync, TypeScript)
- **UI**: shadcn/ui + Tailwind CSS
- **Agent API**: Next.js API routes (thin REST wrapper)
- **Auth**: Convex auth for humans, workspace-scoped API keys for agents

## Data Model

```
Workspace {
  id, name,
  docs?: string,          # Markdown - project overview, conventions, links
  createdAt
}

Issue {
  id, workspaceId, title, description,
  parentId?: string,      # Optional parent issue
  childCount: number,     # Direct sub-issue count
  childDoneCount: number, # Direct sub-issue done count
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
- Issue descriptions: Feature context + atomic leaf-issue requirements

## MVP Features

### Phase 1: Foundation
1. Initialize repo with `init-repo.sh`
2. Create Next.js app with TypeScript
3. Set up Convex (`npx convex init`)
4. Initialize shadcn/ui (`npx shadcn-ui@latest init`)
5. Define Convex schema (workspaces, issues, api_keys)
6. Basic Convex mutations: createIssue, claimIssue, updateStatus, updateDocs

### Phase 2: Web UI
7. Layout with sidebar (workspace list) + main content area
8. Workspace view with kanban columns (unclaimed, in_progress, done)
9. Hierarchical issue list view (drag-to-reparent)
10. Full-page issue detail view with markdown editor
11. Workspace settings page with docs editor
12. Real-time updates via Convex subscriptions

### Phase 3: Agent API
13. REST endpoints: `GET /api/tickets`, `POST /api/tickets/:id/claim`, `POST /api/tickets/:id/complete`
14. `GET /api/workspace/docs` - fetch workspace context
15. API key middleware (validate key, scope to workspace)
16. Generate/manage API keys from web UI

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
│   └── ticket-table.tsx       # Hierarchical issue list
├── lib/                       # Utilities
│   └── api-auth.ts            # API key validation
├── package.json
└── AGENTS.MD
```

## Agent Usage Example
```bash
# Get workspace context (project docs, conventions)
curl -H "X-API-Key: sk_..." https://kanban.example/api/workspace/docs

# List unclaimed issues
curl -H "X-API-Key: sk_..." https://kanban.example/api/tickets?status=unclaimed

# Get issue details
curl -H "X-API-Key: sk_..." https://kanban.example/api/tickets/ISSUE_ID

# Claim an issue
curl -X POST -H "X-API-Key: sk_..." https://kanban.example/api/tickets/ISSUE_ID/claim

# Mark complete
curl -X POST -H "X-API-Key: sk_..." https://kanban.example/api/tickets/ISSUE_ID/complete
```

**Typical Agent Workflow**:
1. Fetch workspace docs to understand project context
2. List unclaimed issues
3. Pick highest priority / best fit issue
4. Claim it
5. Read issue description + child issues for context
6. Do the work
7. Mark complete

## Verification
1. Run `npm run dev` and verify frontend loads
2. Create a workspace and add workspace-level docs
3. Create an issue with markdown description
4. Test kanban drag-drop and table view switching
5. Generate an API key from workspace settings
6. Use curl to:
   - `GET /api/tickets` - list issues
   - `GET /api/workspace/docs` - fetch workspace context
   - `POST /api/tickets/:id/claim` - claim an issue
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
5. Implement Convex schema and mutations
6. Build UI components
8. Add API routes
9. Test end-to-end
