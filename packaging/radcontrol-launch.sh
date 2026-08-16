#!/usr/bin/env bash
set -euo pipefail

readonly RADCONTROL_BINARY="/home/chris/.local/bin/radcontrol-app"

if [[ ! -x "$RADCONTROL_BINARY" ]]; then
  printf 'RadControl production binary is not installed at %s\n' "$RADCONTROL_BINARY" >&2
  exit 1
fi

exec "$RADCONTROL_BINARY"
