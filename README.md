# KanbanThing

LLM-friendly task board for human-agent collaboration. Both humans (via web UI) and LLM agents (via REST API) can view, claim, and complete tickets with real-time sync.

## Features

- **Workspaces**: Project-level isolation for tickets and API keys
- **Kanban Board**: Visual board with unclaimed → in_progress → done columns
- **Table View**: Sortable, filterable ticket list using TanStack Table
- **Real-time Sync**: Changes via API instantly reflect in the UI (Convex)
- **Agent REST API**: Simple endpoints for LLM agents to interact with tickets
- **Workspace Docs**: Markdown documentation for project context
- **Ticket Docs**: Per-ticket context for agents

## Tech Stack

- **Next.js 14+** (App Router)
- **Convex** (real-time backend)
- **shadcn/ui** + **Tailwind CSS**
- **TanStack Table**

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will:
- Prompt you to create a Convex account/project
- Generate type definitions in `convex/_generated/`
- Create `.env.local` with your Convex URL
- Start the Convex development server

Keep this running in a separate terminal.

### 3. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000

## Agent API Usage

### Authentication

All API requests require an `X-API-Key` header. Generate keys from the workspace settings page.

### Endpoints

```bash
# Get workspace docs (project context)
curl -H "X-API-Key: sk_..." http://localhost:3000/api/workspace/docs

# List all tickets
curl -H "X-API-Key: sk_..." http://localhost:3000/api/tickets

# List unclaimed tickets only
curl -H "X-API-Key: sk_..." http://localhost:3000/api/tickets?status=unclaimed

# Get single ticket with docs
curl -H "X-API-Key: sk_..." http://localhost:3000/api/tickets/TICKET_ID

# Claim a ticket (marks as in_progress)
curl -X POST -H "X-API-Key: sk_..." http://localhost:3000/api/tickets/TICKET_ID/claim

# Complete a ticket (marks as done)
curl -X POST -H "X-API-Key: sk_..." http://localhost:3000/api/tickets/TICKET_ID/complete
```

### Typical Agent Workflow

1. Fetch workspace docs to understand project context
2. List unclaimed tickets
3. Pick a ticket and claim it
4. Fetch ticket docs for specific context
5. Do the work
6. Mark ticket as complete

## Data Model

- **Workspaces**: Container for tickets and API keys
- **Tickets**: Tasks with title, description, status, and optional docs
- **API Keys**: Workspace-scoped keys for agent authentication

## Status Flow

```
unclaimed → in_progress → done
```

Any agent or user can claim any unclaimed ticket. Once claimed, only completion or release moves the ticket forward.
