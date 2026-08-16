#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly BINARY="$ROOT/src-tauri/target/release/radcontrol-app"
readonly O2_RUNTIME="$HOME/.local/share/radcontrol/o2-runtime"

for required in \
  "$BINARY" \
  "$O2_RUNTIME/scripts/run_o2.sh" \
  "$O2_RUNTIME/scripts/o2_radcontrol_audit.py" \
  "$O2_RUNTIME/registry/projects.json" \
  "$O2_RUNTIME/registry/project-archetypes.json" \
  "$O2_RUNTIME/registry/empire-todo-seeds.json"; do
  if [[ ! -f "$required" ]]; then
    printf 'Required production artifact is missing: %s\n' "$required" >&2
    exit 1
  fi
done

install -D -m 0755 "$BINARY" "$HOME/.local/bin/radcontrol-app"
install -D -m 0755 "$ROOT/packaging/radcontrol-launch.sh" "$HOME/.local/bin/radcontrol-launch.sh"
install -D -m 0644 "$ROOT/packaging/radcontrol.desktop" "$HOME/.local/share/applications/radcontrol-o2.desktop"
install -D -m 0644 "$ROOT/src-tauri/icons/128x128.png" "$HOME/.local/share/icons/hicolor/128x128/apps/radcontrol-app.png"

printf 'Installed RadControl production binary: %s\n' "$HOME/.local/bin/radcontrol-app"
printf 'Installed RadControl desktop entry: %s\n' "$HOME/.local/share/applications/radcontrol-o2.desktop"
printf 'Canonical O2 runtime: %s\n' "$O2_RUNTIME"
