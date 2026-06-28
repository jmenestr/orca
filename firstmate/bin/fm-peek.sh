#!/usr/bin/env bash
# Print the tail of a crewmate pane (bounded, for cheap diagnosis).
# Usage: fm-peek.sh <window> [lines=40]
#   <window> may be a bare firstmate window name (fm-xyz), resolved through
#   this home's state/<id>.meta, or explicit session:window.
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="${FM_ROOT_OVERRIDE:-$(cd "$SCRIPT_DIR/.." && pwd)}"
FM_HOME="${FM_HOME:-${FM_ROOT_OVERRIDE:-$FM_ROOT}}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"

# shellcheck source=bin/fm-orca-lib.sh
. "$SCRIPT_DIR/fm-orca-lib.sh"

"$SCRIPT_DIR/fm-guard.sh" || true

# engine=orca tasks have no tmux pane: read the agent terminal's tail through the
# Orca CLI instead. A bare fm-<id> whose meta records engine=orca is handled here.
case "${1:-}" in
  fm-*)
    _orca_meta="$STATE/${1#fm-}.meta"
    if [ -f "$_orca_meta" ] && grep -qx 'engine=orca' "$_orca_meta"; then
      _orca_id=${1#fm-}
      N=${2:-40}
      H=$(orca_terminal_handle "$_orca_id") || {
        echo "error: no live Orca terminal for $_orca_id (worktree gone?)" >&2
        exit 1
      }
      orca_cli terminal read --terminal "$H" --limit "$N" || {
        echo "error: 'orca terminal read' failed (is the Orca app running?)" >&2
        exit 1
      }
      exit 0
    fi
    ;;
esac

resolve() {
  case "$1" in
    *:*) echo "$1" ;;
    fm-*)
      meta="$STATE/${1#fm-}.meta"
      if [ ! -f "$meta" ]; then
        echo "error: no metadata for $1 in $STATE; pass session:window to target a window outside this firstmate home" >&2
        exit 1
      fi
      window=$(grep '^window=' "$meta" 2>/dev/null | tail -1 | cut -d= -f2- || true)
      [ -n "$window" ] || { echo "error: no window recorded in $meta" >&2; exit 1; }
      echo "$window"
      ;;
    *) tmux list-windows -a -F '#{session_name}:#{window_name}' | grep -m1 ":$1\$" \
         || { echo "error: no window named $1" >&2; exit 1; } ;;
  esac
}

T=$(resolve "$1")
N=${2:-40}
tmux capture-pane -p -t "$T" -S -"$N"
