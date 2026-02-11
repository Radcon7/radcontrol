#!/usr/bin/env bash
set -euo pipefail

O2_ROOT="${O2_ROOT:-$HOME/dev/o2}"
SCRIPT="$O2_ROOT/scripts/o2_commit.sh"

echo "[radcontrol] invoking O2 commit"
echo "[radcontrol] O2 root: $O2_ROOT"

if [[ ! -x "$SCRIPT" ]]; then
  echo "[radcontrol] ERROR: missing O2 commit script at: $SCRIPT" >&2
  exit 127
fi

exec "$SCRIPT" "$@"