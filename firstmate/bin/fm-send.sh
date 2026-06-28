#!/usr/bin/env bash
# Send one line of literal text to a crewmate window, then Enter.
# Usage: fm-send.sh <window> <text...>
#   <window> may be a bare firstmate window name (fm-xyz), resolved through
#   this home's state/<id>.meta, or explicit session:window.
# Special keys instead of text: fm-send.sh <window> --key Escape   (or Enter, C-c, ...)
#
# Text submission is verified: the line is typed ONCE, then Enter is sent and
# retried (Enter only, never retyped) until the composer clears. If a swallowed
# Enter is positively confirmed (the text is still sitting in the composer after
# all retries), fm-send exits NON-ZERO so the caller knows the steer did not land
# instead of silently leaving an unsubmitted instruction (incident afk-invx-i5).
# The composer/submit logic is shared with the away-mode daemon via
# bin/fm-tmux-lib.sh. Tune with FM_SEND_RETRIES (default 3) / FM_SEND_SLEEP (0.4).
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="${FM_ROOT_OVERRIDE:-$(cd "$SCRIPT_DIR/.." && pwd)}"
FM_HOME="${FM_HOME:-${FM_ROOT_OVERRIDE:-$FM_ROOT}}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"

# shellcheck source=bin/fm-tmux-lib.sh
. "$SCRIPT_DIR/fm-tmux-lib.sh"
# shellcheck source=bin/fm-orca-lib.sh
. "$SCRIPT_DIR/fm-orca-lib.sh"

"$SCRIPT_DIR/fm-guard.sh" || true

# engine=orca tasks run inside the Orca app, not a tmux pane: route steering
# through `orca terminal send` against the worktree's agent terminal. A bare
# fm-<id> whose meta records engine=orca is resolved here; everything else falls
# through to the tmux path below.
orca_send_confirm() {
  local out accepted refused
  out=$(orca_cli terminal send "$@" --json 2>/dev/null) || {
    echo "error: 'orca terminal send' failed (is the Orca app running?)" >&2
    return 1
  }
  accepted=$(printf '%s' "$out" | jq -r '.result.send.accepted // false' 2>/dev/null)
  if [ "$accepted" != true ]; then
    refused=$(printf '%s' "$out" | jq -r '.result.send.refusedReason // "unknown"' 2>/dev/null)
    echo "error: 'orca terminal send' not accepted (reason: $refused)" >&2
    return 1
  fi
  return 0
}

case "${1:-}" in
  fm-*)
    _orca_meta="$STATE/${1#fm-}.meta"
    if [ -f "$_orca_meta" ] && grep -qx 'engine=orca' "$_orca_meta"; then
      _orca_id=${1#fm-}
      shift
      H=$(orca_terminal_handle "$_orca_id") || {
        echo "error: no live Orca terminal for $_orca_id (worktree gone?)" >&2
        exit 1
      }
      if [ "${1:-}" = "--interrupt" ]; then
        orca_send_confirm --terminal "$H" --interrupt || exit 1
      elif [ "${1:-}" = "--key" ]; then
        case "${2:-}" in
          Escape|Esc) orca_send_confirm --terminal "$H" --text $'\x1b' || exit 1 ;;
          Enter)      orca_send_confirm --terminal "$H" --enter || exit 1 ;;
          C-c|c-c)    orca_send_confirm --terminal "$H" --interrupt || exit 1 ;;
          *)
            echo "error: unsupported --key '${2:-}' for engine=orca (use Escape, Enter, C-c, or --interrupt)" >&2
            exit 1
            ;;
        esac
      else
        orca_send_confirm --terminal "$H" --text "$*" --enter || exit 1
      fi
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
shift

if [ "${1:-}" = "--key" ]; then
  tmux send-keys -t "$T" "$2"
else
  # Slash commands open a completion popup in some TUIs (verified on codex);
  # submitting too fast selects nothing. Give popups time to settle.
  case "$*" in /*) settle=1.2 ;; *) settle=0.3 ;; esac
  retries=${FM_SEND_RETRIES:-3}
  sleep_s=${FM_SEND_SLEEP:-0.4}
  # Type once, submit, verify. Lenient: only a positively-confirmed swallow
  # (text still in the composer) is an error; an unreadable pane is assumed sent.
  verdict=$(fm_tmux_submit_core "$T" "$*" "$retries" "$sleep_s" "$settle")
  case "$verdict" in
    pending)
      echo "error: text not submitted to $T (Enter swallowed; text left in composer)" >&2
      exit 1
      ;;
    send-failed)
      echo "error: text not sent to $T (tmux send-keys failed)" >&2
      exit 1
      ;;
  esac
fi
