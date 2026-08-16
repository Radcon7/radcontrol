#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly BINARY="$ROOT/src-tauri/target/release/radcontrol-app"
readonly EXPECTED_HOME="/home/chris"
readonly O2_RUNTIME="$EXPECTED_HOME/.local/share/radcontrol/o2-runtime"

require_canonical_directory() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    mkdir "$path"
  fi
  if [[ -L "$path" ]] || [[ ! -d "$path" ]] ||
    [[ "$(readlink -f -- "$path")" != "$path" ]]; then
    printf 'Refusing unsafe production directory: %s\n' "$path" >&2
    exit 1
  fi
}

if [[ "${HOME:-}" != "$EXPECTED_HOME" ]] ||
  [[ ! -d "$EXPECTED_HOME" ]] ||
  [[ "$(readlink -f -- "$EXPECTED_HOME")" != "$EXPECTED_HOME" ]]; then
  printf 'RadControl installation requires the canonical packaged home %s\n' "$EXPECTED_HOME" >&2
  exit 1
fi

if [[ -L "$O2_RUNTIME" ]] || [[ "$(readlink -f -- "$O2_RUNTIME")" != "$O2_RUNTIME" ]]; then
  printf 'Canonical O2 runtime is missing or unsafe: %s\n' "$O2_RUNTIME" >&2
  exit 1
fi

for required in \
  "$BINARY" \
  "$O2_RUNTIME/scripts/run_o2.sh" \
  "$O2_RUNTIME/scripts/o2_radcontrol_audit.py" \
  "$O2_RUNTIME/registry/projects.json" \
  "$O2_RUNTIME/registry/project-archetypes.json" \
  "$O2_RUNTIME/registry/empire-todo-seeds.json"; do
  if [[ ! -f "$required" ]] || [[ -L "$required" ]] ||
    [[ "$(readlink -f -- "$required")" != "$required" ]]; then
    printf 'Required production artifact is missing or unsafe: %s\n' "$required" >&2
    exit 1
  fi
done

for directory in \
  "$EXPECTED_HOME/.local" \
  "$EXPECTED_HOME/.local/bin" \
  "$EXPECTED_HOME/.local/share" \
  "$EXPECTED_HOME/.local/share/applications" \
  "$EXPECTED_HOME/.local/share/icons" \
  "$EXPECTED_HOME/.local/share/icons/hicolor" \
  "$EXPECTED_HOME/.local/share/icons/hicolor/128x128" \
  "$EXPECTED_HOME/.local/share/icons/hicolor/128x128/apps"; do
  require_canonical_directory "$directory"
done

for destination in \
  "$EXPECTED_HOME/.local/bin/radcontrol-app" \
  "$EXPECTED_HOME/.local/bin/radcontrol-launch.sh" \
  "$EXPECTED_HOME/.local/share/applications/radcontrol-o2.desktop" \
  "$EXPECTED_HOME/.local/share/icons/hicolor/128x128/apps/radcontrol-app.png"; do
  if [[ -L "$destination" ]]; then
    printf 'Refusing to replace a symlinked production target: %s\n' "$destination" >&2
    exit 1
  fi
done

install -D -m 0755 "$BINARY" "$EXPECTED_HOME/.local/bin/radcontrol-app"
install -D -m 0755 "$ROOT/packaging/radcontrol-launch.sh" "$EXPECTED_HOME/.local/bin/radcontrol-launch.sh"
install -D -m 0644 "$ROOT/packaging/radcontrol.desktop" "$EXPECTED_HOME/.local/share/applications/radcontrol-o2.desktop"
install -D -m 0644 "$ROOT/src-tauri/icons/128x128.png" "$EXPECTED_HOME/.local/share/icons/hicolor/128x128/apps/radcontrol-app.png"

printf 'Installed RadControl production binary: %s\n' "$EXPECTED_HOME/.local/bin/radcontrol-app"
printf 'Installed RadControl desktop entry: %s\n' "$EXPECTED_HOME/.local/share/applications/radcontrol-o2.desktop"
printf 'Canonical O2 runtime: %s\n' "$O2_RUNTIME"
