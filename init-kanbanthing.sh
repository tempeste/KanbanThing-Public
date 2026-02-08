#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SOURCE_DIR="$SCRIPT_DIR/agent-resources/kanbanthing-skill"

SCOPE="project"
PLATFORM="both"
PROJECT_PATH=""
ADD_AGENTS_SNIPPET=0
CREATE_CONFIG_TEMPLATE=0
INSTALL_SKILL=1
FORCE=0

print_usage() {
  cat <<'EOF'
Usage:
  ./init-kanbanthing.sh [options]

Options:
  --project, --target <path>       Project to bootstrap (default: current directory)
  --scope <project|global|both>    Install scope (default: project)
  --platform <codex|claude|both>   Platform install target (default: both)
  --add-agents-snippet             Append KanbanThing snippet to AGENTS.MD
  --create-config-template         Create .kanbanthing template and ignore it
  --no-skill                       Skip skill file installation
  --force                          Overwrite generated .kanbanthing template
  --help                           Show this help

Examples:
  ./init-kanbanthing.sh --project ~/personalDev/my-app --add-agents-snippet --create-config-template
  ./init-kanbanthing.sh --scope global --platform codex
EOF
}

log() {
  printf '[kanbanthing-init] %s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

ensure_dir() {
  mkdir -p "$1"
}

ensure_line_in_file() {
  local file="$1"
  local line="$2"
  ensure_dir "$(dirname "$file")"
  touch "$file"
  if ! grep -Fqx "$line" "$file"; then
    printf '\n%s\n' "$line" >>"$file"
  fi
}

install_skill_dir() {
  local destination="$1"
  ensure_dir "$destination"
  cp -R "$SKILL_SOURCE_DIR"/. "$destination"/
  log "Installed skill at $destination"
}

append_agents_snippet() {
  local project_root="$1"
  local agents_file="$project_root/AGENTS.MD"
  local start_marker="<!-- kanbanthing:init:start -->"

  if [[ -f "$agents_file" ]] && grep -Fq "$start_marker" "$agents_file"; then
    log "AGENTS.MD already contains KanbanThing snippet"
    return
  fi

  touch "$agents_file"
  cat >>"$agents_file" <<'EOF'

<!-- kanbanthing:init:start -->
## KanbanThing
- Start with `GET /api/workspace/docs` to load workspace context.
- Find open work with `GET /api/tickets?status=unclaimed`.
- Claim one ticket with `POST /api/tickets/<ticket-id>/claim` before coding.
- Complete with `POST /api/tickets/<ticket-id>/complete` after validation passes.
- Keep credentials in local secrets only (`.kanbanthing` or environment variables).
<!-- kanbanthing:init:end -->
EOF
  log "Updated $agents_file with KanbanThing snippet"
}

create_config_template() {
  local project_root="$1"
  local config_file="$project_root/.kanbanthing"

  if [[ -f "$config_file" && "$FORCE" -ne 1 ]]; then
    log ".kanbanthing already exists (skipped; use --force to overwrite)"
  else
    cat >"$config_file" <<'EOF'
# KanbanThing local config template (do not commit secrets).
# For local dev use https://localhost:3000.
# For hosted/team use, set to your deployed instance URL.
KANBANTHING_BASE_URL=https://localhost:3000
KANBANTHING_WORKSPACE_ID=
KANBANTHING_API_KEY=
EOF
    log "Created $config_file template"
  fi

  ensure_line_in_file "$project_root/.gitignore" ".kanbanthing"
  log "Ensured .kanbanthing is ignored in $project_root/.gitignore"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
  --project | --target)
    [[ $# -ge 2 ]] || fail "Missing value for $1"
    PROJECT_PATH="$2"
    shift 2
    ;;
  --scope)
    [[ $# -ge 2 ]] || fail "Missing value for --scope"
    SCOPE="$2"
    shift 2
    ;;
  --platform)
    [[ $# -ge 2 ]] || fail "Missing value for --platform"
    PLATFORM="$2"
    shift 2
    ;;
  --add-agents-snippet)
    ADD_AGENTS_SNIPPET=1
    shift
    ;;
  --create-config-template)
    CREATE_CONFIG_TEMPLATE=1
    shift
    ;;
  --no-skill)
    INSTALL_SKILL=0
    shift
    ;;
  --force)
    FORCE=1
    shift
    ;;
  --help | -h)
    print_usage
    exit 0
    ;;
  *)
    fail "Unknown option: $1"
    ;;
  esac
done

if [[ "$INSTALL_SKILL" -eq 1 && ! -d "$SKILL_SOURCE_DIR" ]]; then
  fail "Skill source directory missing: $SKILL_SOURCE_DIR"
fi

case "$SCOPE" in
project | global | both) ;;
*) fail "--scope must be one of: project, global, both" ;;
esac

case "$PLATFORM" in
codex | claude | both) ;;
*) fail "--platform must be one of: codex, claude, both" ;;
esac

if [[ -z "$PROJECT_PATH" ]]; then
  PROJECT_PATH="$PWD"
fi

if [[ "$SCOPE" != "global" || "$ADD_AGENTS_SNIPPET" -eq 1 || "$CREATE_CONFIG_TEMPLATE" -eq 1 ]]; then
  [[ -d "$PROJECT_PATH" ]] || fail "Project path does not exist: $PROJECT_PATH"
  PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"
fi

install_project_scoped() {
  local root="$1"
  if [[ "$PLATFORM" == "codex" || "$PLATFORM" == "both" ]]; then
    install_skill_dir "$root/.agents/skills/kanbanthing"
  fi
  if [[ "$PLATFORM" == "claude" || "$PLATFORM" == "both" ]]; then
    install_skill_dir "$root/.claude/skills/kanbanthing"
  fi
}

install_global_scoped() {
  local codex_home="${CODEX_HOME:-$HOME/.codex}"
  if [[ "$PLATFORM" == "codex" || "$PLATFORM" == "both" ]]; then
    install_skill_dir "$codex_home/skills/kanbanthing"
  fi
  if [[ "$PLATFORM" == "claude" || "$PLATFORM" == "both" ]]; then
    install_skill_dir "$HOME/.claude/skills/kanbanthing"
  fi
}

if [[ "$INSTALL_SKILL" -eq 1 ]]; then
  if [[ "$SCOPE" == "project" || "$SCOPE" == "both" ]]; then
    install_project_scoped "$PROJECT_PATH"
  fi

  if [[ "$SCOPE" == "global" || "$SCOPE" == "both" ]]; then
    install_global_scoped
  fi
fi

if [[ "$ADD_AGENTS_SNIPPET" -eq 1 ]]; then
  append_agents_snippet "$PROJECT_PATH"
fi

if [[ "$CREATE_CONFIG_TEMPLATE" -eq 1 ]]; then
  create_config_template "$PROJECT_PATH"
fi

log "Initialization complete"
