#!/usr/bin/env bash
set -euo pipefail

# O2 Repo Index (RadControl)
# Writes bounded repo index into docs/_o2_repo_index.txt

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/_o2_repo_index.txt"

cd "$ROOT"

ts() { date +"%Y-%m-%d %H:%M:%S %z"; }

section() {
  echo
  echo "================================================================================"
  echo "$1"
  echo "================================================================================"
}

preview_file() {
  local f="$1"
  local max="${2:-200}"
  echo
  echo "----- FILE: $f (head -n $max) -----"
  if [[ -f "$f" ]]; then
    sed -n "1,${max}p" "$f" || true
  else
    echo "[missing]"
  fi
}

grep_block() {
  local title="$1"
  local pattern="$2"
  local path="${3:-.}"
  section "$title"

  local rg_available="no"
  if command -v rg >/dev/null 2>&1; then rg_available="yes"; fi

  if [[ "$rg_available" == "yes" ]]; then
    rg -n --no-heading --hidden --glob "!.git/**" --glob "!dist/**" --glob "!node_modules/**" \
      --glob "!docs/_repo_snapshot.txt" --glob "!docs/_o2_repo_index.txt" \
      "$pattern" "$path" | head -n 250 || true
  else
    grep -RIn --exclude-dir=.git --exclude-dir=dist --exclude-dir=node_modules \
      --exclude=docs/_repo_snapshot.txt --exclude=docs/_o2_repo_index.txt \
      -E "$pattern" "$path" 2>/dev/null | head -n 250 || true
  fi
}

mkdir -p "$ROOT/docs"

{
  echo "O2_REPO_INDEX (RadControl)"
  echo "Generated: $(ts)"
  echo "Repo: $ROOT"
  echo

  section "GIT STATUS (for context)"
  git status -sb || true

  section "TOP-LEVEL FILES (bounded)"
  ls -la | sed -n '1,160p' || true

  section "DOCS INDEX"
  (cd docs && ls -la) | sed -n '1,200p' || true

  section "KEY DOCS (bounded previews)"
  preview_file "docs/REPO_STATE.md" 220

  section "SOURCE TREE (bounded listings)"
  find "src" -maxdepth 3 -type f 2>/dev/null | sed 's|^\./||' | sort | head -n 400 || true
  echo
  find "src-tauri" -maxdepth 4 -type f 2>/dev/null | sed 's|^\./||' | sort | head -n 400 || true

  section "HOTSPOT GREPS (intervention + command wiring)"
  grep_block "INTERVENTION" 'intervention' "src"
  grep_block "TABS / NAV" 'type TabKey|setTab\(|tab ===' "src"
  grep_block "TAURI INVOKES" 'invoke\(' "src"
  grep_block "FS / PATH / SHELL (if any)" 'fs|path|shell|Command' "src"

  section "PACKAGE / TOOLING (bounded)"
  preview_file "package.json" 220
  preview_file "vite.config.ts" 200
  preview_file "tsconfig.json" 200

  section "SCRIPTS (bounded)"
  preview_file "scripts/o2_session_start.sh" 200
  preview_file "scripts/snapshot_repo_state.sh" 220

  section "END"
  echo "Wrote: docs/_o2_repo_index.txt"
} > "$OUT"

echo "O2 repo index written: $OUT"