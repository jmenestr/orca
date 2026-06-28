#!/usr/bin/env bash
# Shared helpers for the mode=orca backend: run crewmates INSIDE the Orca app
# (via the `orca` worktree + terminal CLI) instead of a local tmux pane or a
# GitHub Codespace. This is the structural analogue of fm-codespace-lib.sh.
#
# Sourced by fm-spawn.sh (mode=orca branch), fm-send.sh / fm-peek.sh
# (engine=orca), fm-teardown.sh (mode=orca branch), and the generated
# state/<id>.check.sh status poller.
#
# Status source note (important): this Orca build exposes NO `orca terminal
# agentStatus` command. The same agent status it would report (working |
# permission | idle) is surfaced by `orca worktree ps --json` as each worktree's
# rollup `.status` (active|working|permission|done|inactive), and process exit by
# `orca terminal read --json` `.status` (running|exited|unknown). orca_check_emit
# below reads both and mirrors one mapped firstmate status line, so the adapter
# stays entirely within firstmate/ (no Orca CLI change) while delivering the
# specified mapping, including permission -> needs-a-steer.

# --- orca CLI invoker --------------------------------------------------------
# Resolve a stable way to invoke the Orca CLI once per process, in priority
# order: an explicit $FM_ORCA_CLI override, then `orca` on PATH (production
# install), then `orca-dev` (the dev symlink from `pnpm build:cli`), then the
# vendored dev build at <orca-repo>/out/cli/index.js (this lib lives at
# <orca-repo>/firstmate/bin, so the repo root is two levels up). The resolved
# invoker may be a multi-word command ("node /path/index.js"), so callers must
# let it word-split.
_fm_orca_resolve_cli() {
  [ -n "${FM_ORCA_CLI_RESOLVED:-}" ] && return 0
  if [ -n "${FM_ORCA_CLI:-}" ]; then FM_ORCA_CLI_RESOLVED="$FM_ORCA_CLI"; return 0; fi
  if command -v orca >/dev/null 2>&1; then FM_ORCA_CLI_RESOLVED=orca; return 0; fi
  if command -v orca-dev >/dev/null 2>&1; then FM_ORCA_CLI_RESOLVED=orca-dev; return 0; fi
  local libdir orca_repo cli_js
  libdir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  orca_repo=$(cd "$libdir/../.." && pwd)
  cli_js="$orca_repo/out/cli/index.js"
  if [ -f "$cli_js" ]; then FM_ORCA_CLI_RESOLVED="node $cli_js"; return 0; fi
  return 1
}

# Run the Orca CLI with the given args. Returns 127 with a clear message when no
# CLI can be found.
orca_cli() {
  _fm_orca_resolve_cli || {
    echo "error: no Orca CLI found. Set FM_ORCA_CLI, install 'orca'/'orca-dev', or build it with 'pnpm build:cli' (out/cli/index.js)." >&2
    return 127
  }
  # shellcheck disable=SC2086  # deliberate word-split: the invoker may be "node /path/index.js"
  command $FM_ORCA_CLI_RESOLVED "$@"
}

# --- preflight ----------------------------------------------------------------
# Fail clearly when the Orca app/runtime is not ready, so spawn never tries to
# create a worktree against a dead app. Mirrors the codespace SSH-ready gate.
orca_preflight() {
  local out
  out=$(orca_cli status --json 2>/dev/null) || {
    echo "error: orca preflight failed - the Orca CLI could not reach the app. Start Orca (orca open) and retry." >&2
    return 1
  }
  if ! printf '%s' "$out" | jq -e '.ok and .result.app.running and .result.runtime.reachable' >/dev/null 2>&1; then
    echo "error: orca preflight failed - the Orca app/runtime is not ready. Start Orca (orca open) and retry." >&2
    printf '%s' "$out" | jq -r '.result | "  appRunning=\(.app.running) runtimeReachable=\(.runtime.reachable) runtimeState=\(.runtime.state)"' 2>/dev/null >&2 || true
    return 1
  fi
  return 0
}

# --- meta / selector resolution ----------------------------------------------
# These read $STATE, which the sourcing script defines (fm-spawn/send/peek/
# teardown all set it the same way); the generated check.sh sets it explicitly.
orca_meta_get() {
  local id=$1 key=$2 meta
  meta="$STATE/$id.meta"
  [ -f "$meta" ] || return 1
  grep "^$key=" "$meta" | tail -1 | cut -d= -f2- || true
}

# The worktree selector recorded at spawn time, e.g. "id:<repoId>::/path".
orca_worktree_selector() {
  orca_meta_get "$1" worktree
}

# Resolve the live terminal handle for a task: prefer the handle recorded in
# meta, else look up the worktree's first live terminal via the CLI. Resolving
# from the worktree keeps send/read working even if the recorded handle is
# stale (e.g. the agent terminal was re-created).
orca_terminal_handle() {
  local id=$1 handle sel list
  handle=$(orca_meta_get "$id" terminal || true)
  if [ -n "$handle" ]; then printf '%s\n' "$handle"; return 0; fi
  sel=$(orca_worktree_selector "$id" || true)
  [ -n "$sel" ] || return 1
  list=$(orca_cli terminal list --worktree "$sel" --json 2>/dev/null) || return 1
  handle=$(printf '%s' "$list" | jq -r '.result.terminals[0].handle // empty' 2>/dev/null)
  [ -n "$handle" ] || return 1
  printf '%s\n' "$handle"
}

# --- status-line emitter ------------------------------------------------------
# Map the Orca agent status (worktree rollup status + terminal run state) to ONE
# firstmate status line. The mapping the milestone requires:
#   terminal exited        -> done       (agent process gone)
#   worktree 'permission'  -> needs-decision  (a needs-a-steer wake; highest value)
#   worktree 'working'     -> working
#   worktree 'done'        -> done       (agent reported a finished turn)
#   worktree active/inactive (idle)      -> working: ... idle (turn boundary; wakes
#                                           on change, self-handled by the sub-supervisor)
#   anything unknown / app down          -> unknown  (NEVER faked as exited)
orca_status_line() {
  local ps_status=$1 term_state=$2
  if [ "$term_state" = exited ]; then
    printf 'done: orca agent terminal exited\n'; return 0
  fi
  case "$ps_status" in
    permission) printf 'needs-decision: orca agent is waiting for input (permission/approval)\n' ;;
    working)    printf 'working: orca agent working\n' ;;
    done)       printf 'done: orca agent finished its turn\n' ;;
    active|inactive) printf 'working: orca agent idle (turn ended, awaiting input)\n' ;;
    *)          printf 'unknown: orca agent status unavailable\n' ;;
  esac
}

# Mirror a status line into state/<id>.status only when it differs from the last
# mirrored line (recorded in the sibling state/<id>.check.last). This is the
# codespace check.sh dedupe pattern: the local status file's hash changes exactly
# once per distinct status, so the watcher's signal scan wakes firstmate once and
# never loops.
orca_mirror_status() {
  local id=$1 line=$2 last_file status_file
  last_file="$STATE/$id.check.last"
  status_file="$STATE/$id.status"
  [ -n "$line" ] || return 0
  [ "$line" = "$(cat "$last_file" 2>/dev/null)" ] && return 0
  printf '%s\n' "$line" > "$last_file"
  printf '%s\n' "$line" >> "$status_file"
}

# The body of the generated state/<id>.check.sh: query Orca for the task's agent
# status and mirror one mapped line on change. Prints NOTHING to stdout (the
# status append is the single wake; emitting the line too would add a redundant
# 'check:' wake for the same status). On a failed Orca call (app down) it mirrors
# an 'unknown' line and surfaces the error to stderr - never a faked 'exited'.
# Args: <id> <worktree-selector>
orca_check_emit() {
  local id=$1 sel=$2 wid ps_json ps_status handle term_json term_state line
  wid=${sel#id:}

  ps_json=$(orca_cli worktree ps --json 2>/dev/null) || {
    echo "orca check: worktree ps failed for $id (Orca app unreachable?)" >&2
    orca_mirror_status "$id" "unknown: orca agent status unavailable (app unreachable)"
    return 0
  }
  if ! printf '%s' "$ps_json" | jq -e '.ok' >/dev/null 2>&1; then
    echo "orca check: worktree ps returned an error for $id" >&2
    orca_mirror_status "$id" "unknown: orca agent status unavailable (app unreachable)"
    return 0
  fi
  ps_status=$(printf '%s' "$ps_json" \
    | jq -r --arg w "$wid" '.result.worktrees[] | select(.worktreeId==$w) | .status' 2>/dev/null \
    | head -1)

  # Terminal run state (exit detection). A failed read leaves term_state empty,
  # which keeps the mapping on the worktree status rather than faking an exit.
  term_state=
  handle=$(orca_terminal_handle "$id" || true)
  if [ -n "$handle" ]; then
    term_json=$(orca_cli terminal read --terminal "$handle" --limit 1 --json 2>/dev/null || true)
    term_state=$(printf '%s' "$term_json" | jq -r '.result.terminal.status // empty' 2>/dev/null)
  fi

  # No worktree row and no terminal means the task's surfaces are gone; report
  # unknown rather than guessing a terminal-exited 'done'.
  if [ -z "$ps_status" ] && [ -z "$term_state" ]; then
    orca_mirror_status "$id" "unknown: orca agent status unavailable"
    return 0
  fi

  line=$(orca_status_line "${ps_status:-unknown}" "${term_state:-running}")
  orca_mirror_status "$id" "$line"
  return 0
}
