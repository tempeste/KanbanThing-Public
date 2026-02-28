#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
KanbanThing OpenClaw skill wrapper

Usage:
  kanbanthing.sh [--workspace ALIAS | --workspace-id ID] [--mapping-file FILE] <command> [args...]

Commands:
  kanbanthing.sh mapping add --auto [--alias NAME] [--dry-run] [--force]
  kanbanthing.sh mapping add --repo /path/to/repo [--alias NAME] [--dry-run] [--force]
  kanbanthing.sh mapping doctor
  kanbanthing.sh mapping list
  kanbanthing.sh doctor
  kanbanthing.sh workspace-docs
  kanbanthing.sh tickets-list [--status STATUS] [--fields full|summary] [--limit N] [--parent-id ID|root|null]
  kanbanthing.sh ticket-get <ticket-id>
  kanbanthing.sh ticket-claim <ticket-id>
  kanbanthing.sh ticket-complete <ticket-id>
  kanbanthing.sh ticket-status <ticket-id> <status> [--reason TEXT] [--order N]
  kanbanthing.sh ticket-update <ticket-id> --json '{"title":"..."}'
  kanbanthing.sh ticket-update <ticket-id> --file /path/to/patch.json
  kanbanthing.sh ticket-comment <ticket-id> <comment-text>

Env:
  KANBANTHING_API_KEY          required
  KANBANTHING_API_URL          preferred base URL (e.g. http://localhost:3000)
  KANBANTHING_URL              fallback base URL
  KANBANTHING_WORKSPACES_FILE  optional mapping file (default: ~/.openclaw/kanbanthing-workspaces.json)
EOF
}

die() {
  echo "kanbanthing.sh: $*" >&2
  exit 1
}

require_bin() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required binary: $1"
}

require_bin curl
require_bin jq

TMP_FILES=()
cleanup_tmp_files() {
  local tmp
  for tmp in "${TMP_FILES[@]:-}"; do
    [[ -n "$tmp" ]] || continue
    rm -f "$tmp" 2>/dev/null || true
  done
}
trap cleanup_tmp_files EXIT
trap 'cleanup_tmp_files; exit 130' INT
trap 'cleanup_tmp_files; exit 143' TERM
trap 'cleanup_tmp_files; exit 129' HUP

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

DEFAULT_MAPPING_FILE="${HOME}/.openclaw/kanbanthing-workspaces.json"
workspace_alias=""
workspace_id=""
mapping_file="${KANBANTHING_WORKSPACES_FILE:-$DEFAULT_MAPPING_FILE}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      workspace_alias="${2:-}"
      [[ -n "$workspace_alias" ]] || die "--workspace requires a value"
      shift 2
      ;;
    --workspace-id)
      workspace_id="${2:-}"
      [[ -n "$workspace_id" ]] || die "--workspace-id requires a value"
      shift 2
      ;;
    --mapping-file)
      mapping_file="${2:-}"
      [[ -n "$mapping_file" ]] || die "--mapping-file requires a value"
      shift 2
      ;;
    --help|-h|help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [[ -n "$workspace_alias" && -n "$workspace_id" ]]; then
  die "Use only one of --workspace or --workspace-id"
fi

EXPLICIT_SELECTOR_MODE="false"
if [[ -n "$workspace_alias" || -n "$workspace_id" ]]; then
  EXPLICIT_SELECTOR_MODE="true"
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

load_env_file_if_present() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local line raw_key key value

  while IFS= read -r line || [[ -n "$line" ]]; do
    # Normalize CRLF
    line="${line%$'\r'}"

    # Skip blanks/comments
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    # Support optional `export KEY=...` (including leading whitespace / extra spacing)
    if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]]; then
      line="${line#"${line%%[![:space:]]*}"}"
      line="${line#export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi

    [[ "$line" == *"="* ]] || continue
    raw_key="${line%%=*}"
    value="${line#*=}"

    # Trim key/value whitespace
    key="${raw_key#"${raw_key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    case "$key" in
      KANBANTHING_API_KEY|KANBANTHING_API_URL|KANBANTHING_URL|KANBANTHING_BASE_URL|KANBANTHING_WORKSPACE_ID)
        # Strip matching surrounding quotes if present.
        if [[ "$value" =~ ^\".*\"$ ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "$value" =~ ^\'.*\'$ ]]; then
          value="${value:1:${#value}-2}"
        fi

        # Respect already-exported values.
        if [[ -z "${!key:-}" ]]; then
          printf -v "$key" '%s' "$value"
          export "$key"
        fi
        ;;
    esac
  done <"$file"
}

resolve_mapping_entry() {
  RESOLVED_MAPPING_ENTRY=""
  if [[ ! -f "$mapping_file" ]]; then
    if [[ "$EXPLICIT_SELECTOR_MODE" == "true" ]]; then
      die "Mapping file not found: $mapping_file"
    fi
    return 0
  fi
  local cwd resolved
  cwd="$(pwd -P)"

  if [[ -n "$workspace_alias" ]]; then
    resolved="$(jq -c --arg alias "$workspace_alias" '
      if (.workspaces | type) == "array" then
        first(.workspaces[] | select((.alias // "") == $alias))
      elif (.workspaces | type) == "object" then
        (.workspaces[$alias] // empty) as $entry
        | if ($entry | type) == "object" then ($entry + { alias: ($entry.alias // $alias) }) else empty end
      else
        empty
      end
    ' "$mapping_file")" || die "Invalid mapping file JSON: $mapping_file"
    [[ -n "$resolved" && "$resolved" != "null" ]] || die "Workspace alias not found in mapping: $workspace_alias"
    RESOLVED_MAPPING_ENTRY="$resolved"
    return 0
  fi

  if [[ -n "$workspace_id" ]]; then
    resolved="$(jq -c --arg wid "$workspace_id" '
      def entries:
        if (.workspaces | type) == "array" then
          .workspaces[]
        elif (.workspaces | type) == "object" then
          .workspaces | to_entries[] | (.value + { alias: (.value.alias // .key) })
        else
          empty
        end;
      first(entries | select((.workspaceId // "") == $wid))
    ' "$mapping_file")" || die "Invalid mapping file JSON: $mapping_file"
    [[ -n "$resolved" && "$resolved" != "null" ]] || die "Workspace ID not found in mapping: $workspace_id"
    RESOLVED_MAPPING_ENTRY="$resolved"
    return 0
  fi

  resolved="$(jq -c --arg cwd "$cwd" '
    def entries:
      if (.workspaces | type) == "array" then
        .workspaces[]
      elif (.workspaces | type) == "object" then
        .workspaces | to_entries[] | (.value + { alias: (.value.alias // .key) })
      else
        empty
      end;
    [entries
      | . as $entry
      | ($entry.dir // "") as $dir
      | select($dir != "")
      | $entry + { _dirLen: ($dir | length) }
      | select($cwd == $dir or ($cwd | startswith($dir + "/")))]
    | sort_by(._dirLen)
    | last
    | del(._dirLen)
  ' "$mapping_file")" || die "Invalid mapping file JSON: $mapping_file"
  if [[ -n "$resolved" && "$resolved" != "null" ]]; then
    RESOLVED_MAPPING_ENTRY="$resolved"
  fi
}

MAPPED_ENTRY_JSON=""
MAPPED_ALIAS=""
MAPPED_WORKSPACE_ID=""
MAPPED_DIR=""
MAPPED_API_URL=""
MAPPING_USED="false"

apply_mapping_entry() {
  local entry_json="$1"
  [[ -n "$entry_json" ]] || return 0
  [[ "$entry_json" != "null" ]] || return 0

  MAPPED_ENTRY_JSON="$entry_json"
  MAPPING_USED="true"
  MAPPED_ALIAS="$(printf '%s' "$entry_json" | jq -r '.alias // empty')"
  MAPPED_WORKSPACE_ID="$(printf '%s' "$entry_json" | jq -r '.workspaceId // empty')"
  MAPPED_DIR="$(printf '%s' "$entry_json" | jq -r '.dir // empty')"
  MAPPED_API_URL="$(printf '%s' "$entry_json" | jq -r '.apiUrl // empty')"

  if [[ -n "$MAPPED_DIR" && ! -d "$MAPPED_DIR" ]]; then
    if [[ "$EXPLICIT_SELECTOR_MODE" == "true" ]]; then
      die "Mapped dir does not exist for selected workspace: $MAPPED_DIR"
    fi
    MAPPED_DIR=""
  fi

  if [[ -n "$MAPPED_DIR" && -d "$MAPPED_DIR" ]]; then
    # Default precedence: .env.local overrides .env (when vars are not already exported)
    local env_files_json env_rel env_path
    env_files_json="$(printf '%s' "$entry_json" | jq -c '.envFiles // [".env.local", ".env"]')"
    while IFS= read -r env_rel; do
      [[ -n "$env_rel" ]] || continue
      env_path="${MAPPED_DIR%/}/${env_rel}"
      load_env_file_if_present "$env_path"
    done < <(printf '%s' "$env_files_json" | jq -r '.[]')
  fi

  if [[ -z "${KANBANTHING_API_URL:-${KANBANTHING_URL:-}}" && -n "$MAPPED_API_URL" ]]; then
    export KANBANTHING_API_URL="$MAPPED_API_URL"
  fi
}

resolve_mapping_entry
apply_mapping_entry "$RESOLVED_MAPPING_ENTRY"

# Support OpenClaw agents that run in a workspace with credentials in local .env files.
# Environment variables already exported by the runtime take precedence.
if [[ "$EXPLICIT_SELECTOR_MODE" != "true" ]] && [[ -z "${KANBANTHING_API_KEY:-}" || -z "${KANBANTHING_API_URL:-${KANBANTHING_URL:-}}" ]]; then
  load_env_file_if_present ".kanbanthing"
  load_env_file_if_present ".env.local"
  load_env_file_if_present ".env"
fi

if [[ -z "${KANBANTHING_API_KEY:-}" ]]; then
  die "KANBANTHING_API_KEY is required"
fi

raw_base="${KANBANTHING_API_URL:-${KANBANTHING_BASE_URL:-${KANBANTHING_URL:-}}}"
if [[ -z "$raw_base" ]]; then
  die "Set KANBANTHING_API_URL (preferred) or KANBANTHING_URL"
fi

case "$raw_base" in
  http://*|https://*) BASE_URL="$raw_base" ;;
  *) BASE_URL="http://$raw_base" ;;
esac

# Trim trailing slash to avoid double-slash paths.
BASE_URL="${BASE_URL%/}"

urlencode() {
  jq -rn --arg v "$1" '$v|@uri'
}

require_safe_ticket_id() {
  local ticket_id="$1"
  [[ -n "$ticket_id" ]] || die "Ticket ID is required"
  [[ "$ticket_id" =~ ^[A-Za-z0-9_-]+$ ]] || die "Invalid ticket ID format: $ticket_id"
}

http_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  local url="${BASE_URL}${path}"
  local tmp_body
  tmp_body="$(mktemp)"
  TMP_FILES+=("$tmp_body")
  local curl_exit=0
  local status=""

  if [[ -n "$body" ]]; then
    status="$(curl -sS --connect-timeout 5 --max-time 30 \
      -X "$method" \
      -H "X-API-Key: $KANBANTHING_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$body" \
      -o "$tmp_body" \
      -w "%{http_code}" \
      "$url")" || curl_exit=$?
  else
    status="$(curl -sS --connect-timeout 5 --max-time 30 \
      -X "$method" \
      -H "X-API-Key: $KANBANTHING_API_KEY" \
      -o "$tmp_body" \
      -w "%{http_code}" \
      "$url")" || curl_exit=$?
  fi

  if [[ $curl_exit -ne 0 ]]; then
    rm -f "$tmp_body"
    echo "kanbanthing.sh: Network error calling ${method} ${url} (curl exit ${curl_exit})" >&2
    return 1
  fi

  if [[ ! "$status" =~ ^[0-9]{3}$ ]]; then
    local raw
    raw="$(cat "$tmp_body" 2>/dev/null || true)"
    rm -f "$tmp_body"
    echo "kanbanthing.sh: Unexpected HTTP status output: ${status}. Body: ${raw}" >&2
    return 1
  fi

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "HTTP ${status} ${method} ${path}" >&2
    if jq . <"$tmp_body" >/dev/null 2>&1; then
      jq . <"$tmp_body" >&2 || true
    else
      cat "$tmp_body" >&2 || true
    fi
    rm -f "$tmp_body"
    return 1
  fi

  if jq . <"$tmp_body" >/dev/null 2>&1; then
    jq . <"$tmp_body"
  else
    cat "$tmp_body"
  fi
  rm -f "$tmp_body"
}

build_query() {
  local -a pairs=()
  while [[ $# -gt 0 ]]; do
    local k="$1"
    local v="$2"
    shift 2
    [[ -z "$v" ]] && continue
    pairs+=("$(printf '%s=%s' "$k" "$(urlencode "$v")")")
  done

  if [[ ${#pairs[@]} -eq 0 ]]; then
    printf ''
    return
  fi

  local joined
  joined="$(IFS='&'; echo "${pairs[*]}")"
  printf '?%s' "$joined"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  doctor)
    jq -n \
      --arg base_url "$BASE_URL" \
      --arg has_api_key "true" \
      --arg api_key_source "${KANBANTHING_API_KEY:+env-or-dotenv}" \
      --arg mapping_file "$mapping_file" \
      --arg mapping_used "$MAPPING_USED" \
      --arg mapped_alias "$MAPPED_ALIAS" \
      --arg mapped_workspace_id "$MAPPED_WORKSPACE_ID" \
      --arg mapped_dir "$MAPPED_DIR" \
      '{
        ok: true,
        baseUrl: $base_url,
        hasApiKey: ($has_api_key == "true"),
        envSource: (env.KANBANTHING_API_URL // (env.KANBANTHING_URL // null)),
        apiKeySource: $api_key_source,
        routing: {
          mappingFile: $mapping_file,
          mappingUsed: ($mapping_used == "true"),
          alias: (if $mapped_alias == "" then null else $mapped_alias end),
          workspaceId: (if $mapped_workspace_id == "" then null else $mapped_workspace_id end),
          dir: (if $mapped_dir == "" then null else $mapped_dir end)
        }
      }'
    ;;

  workspace-docs)
    http_json GET "/api/workspace/docs"
    ;;

  tickets-list)
    status=""
    fields=""
    limit=""
    parent_id=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --status) status="${2:-}"; shift 2 ;;
        --fields) fields="${2:-}"; shift 2 ;;
        --limit) limit="${2:-}"; shift 2 ;;
        --parent-id) parent_id="${2:-}"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) die "Unknown tickets-list arg: $1" ;;
      esac
    done
    query="$(build_query status "$status" fields "$fields" limit "$limit" parentId "$parent_id")"
    http_json GET "/api/tickets${query}"
    ;;

  ticket-get)
    [[ $# -eq 1 ]] || die "ticket-get requires <ticket-id>"
    require_safe_ticket_id "$1"
    http_json GET "/api/tickets/$1"
    ;;

  ticket-claim)
    [[ $# -eq 1 ]] || die "ticket-claim requires <ticket-id>"
    require_safe_ticket_id "$1"
    http_json POST "/api/tickets/$1/claim"
    ;;

  ticket-complete)
    [[ $# -eq 1 ]] || die "ticket-complete requires <ticket-id>"
    require_safe_ticket_id "$1"
    http_json POST "/api/tickets/$1/complete"
    ;;

  ticket-status)
    [[ $# -ge 2 ]] || die "ticket-status requires <ticket-id> <status>"
    ticket_id="$1"
    require_safe_ticket_id "$ticket_id"
    status_value="$2"
    shift 2
    reason=""
    order=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --reason) reason="${2:-}"; shift 2 ;;
        --order) order="${2:-}"; shift 2 ;;
        *) die "Unknown ticket-status arg: $1" ;;
      esac
    done
    if [[ -n "$order" && ! "$order" =~ ^-?[0-9]+$ ]]; then
      die "ticket-status --order must be an integer"
    fi
    body="$(jq -n \
      --arg status "$status_value" \
      --arg reason "$reason" \
      --arg order "$order" \
      '{
        status: $status
      }
      + (if $reason != "" then {reason: $reason} else {} end)
      + (if $order != "" then {order: ($order | tonumber)} else {} end)')"
    http_json POST "/api/tickets/${ticket_id}/status" "$body"
    ;;

  ticket-comment)
    [[ $# -ge 2 ]] || die "ticket-comment requires <ticket-id> <comment-text>"
    ticket_id="$1"
    require_safe_ticket_id "$ticket_id"
    shift
    comment_text="$*"
    body="$(jq -n --arg body "$comment_text" '{body: $body}')"
    http_json POST "/api/tickets/${ticket_id}/comments" "$body"
    ;;

  ticket-update)
    [[ $# -ge 2 ]] || die "ticket-update requires <ticket-id> plus --json or --file"
    ticket_id="$1"
    require_safe_ticket_id "$ticket_id"
    shift
    raw_json=""
    file_path=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --json) raw_json="${2:-}"; shift 2 ;;
        --file) file_path="${2:-}"; shift 2 ;;
        *) die "Unknown ticket-update arg: $1" ;;
      esac
    done
    if [[ -n "$raw_json" && -n "$file_path" ]]; then
      die "Use only one of --json or --file"
    fi
    if [[ -z "$raw_json" && -z "$file_path" ]]; then
      die "ticket-update requires --json or --file"
    fi
    if [[ -n "$file_path" ]]; then
      [[ -f "$file_path" ]] || die "ticket-update file not found: $file_path"
      raw_json="$(cat "$file_path")"
    fi
    validated_json="$(printf '%s' "$raw_json" | jq -c 'if type == "object" then . else error("JSON body must be an object") end')"
    http_json PATCH "/api/tickets/${ticket_id}" "$validated_json"
    ;;

  mapping)
    subcmd="${1:-}"
    [[ -n "$subcmd" ]] || die "mapping requires a subcommand (add|doctor|list)"
    shift || true
    case "$subcmd" in
      add)
        repo_path=""
        alias=""
        dry_run="false"
        force="false"
        auto="false"
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --auto) auto="true"; shift ;;
            --repo) repo_path="${2:-}"; [[ -n "$repo_path" ]] || die "--repo requires a value"; shift 2 ;;
            --alias) alias="${2:-}"; [[ -n "$alias" ]] || die "--alias requires a value"; shift 2 ;;
            --dry-run) dry_run="true"; shift ;;
            --force) force="true"; shift ;;
            *) die "Unknown mapping add arg: $1" ;;
          esac
        done
        if [[ "$auto" == "true" && -n "$repo_path" ]]; then
          die "Use only one of --auto or --repo"
        fi
        if [[ "$auto" == "true" ]]; then
          repo_path="$(pwd -P)"
        fi
        [[ -n "$repo_path" ]] || die "mapping add requires --auto or --repo"

        payload="$(jq -n \
          --arg repoPath "$repo_path" \
          --arg workspaceId "$workspace_id" \
          --arg alias "$alias" \
          --arg mappingFile "$mapping_file" \
          --arg dryRun "$dry_run" \
          --arg force "$force" \
          '{
            repoPath: $repoPath,
            dryRun: ($dryRun == "true"),
            force: ($force == "true")
          }
          + (if $workspaceId != "" then {workspaceId: $workspaceId} else {} end)
          + (if $alias != "" then {alias: $alias} else {} end)
          + (if $mappingFile != "" then {mappingFile: $mappingFile} else {} end)')"
        http_json POST "/api/openclaw/workspace-mapping/upsert" "$payload"
        ;;

      doctor)
        query="$(build_query mappingFile "$mapping_file" workspaceId "$workspace_id")"
        http_json GET "/api/openclaw/workspace-mapping/doctor${query}"
        ;;

      list)
        query="$(build_query mappingFile "$mapping_file")"
        report="$(http_json GET "/api/openclaw/workspace-mapping/doctor${query}")"
        printf '%s' "$report" | jq '{
          ok,
          mappingFile,
          entries: [.entries[] | {alias, workspaceId, dir, status}]
        }'
        ;;

      *)
        die "Unknown mapping subcommand: ${subcmd}"
        ;;
    esac
    ;;

  -h|--help|help)
    usage
    ;;

  *)
    die "Unknown command: ${cmd}"
    ;;
esac
