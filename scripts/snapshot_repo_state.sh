#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/_repo_snapshot.txt"

mkdir -p "$ROOT/docs"

{
  echo "=== SNAPSHOT: RadControl ==="
  echo "root: $ROOT"
  echo "time: $(date)"
  echo

  echo "## identity"
  git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/^/branch: /' || echo "branch: (no git)"
  git -C "$ROOT" rev-parse HEAD 2>/dev/null | sed 's/^/commit: /' || echo "commit: (no git)"
  echo

  echo "## status"
  git -C "$ROOT" status || true
  echo

  echo "## recent commits"
  git -C "$ROOT" log -5 --oneline || true
  echo

  echo "## tree (depth 4, filtered)"
  tree -a -L 4 -I 'node_modules|dist|.git|target|.next|coverage' "$ROOT" || true
  echo

  echo "## package.json (name + scripts)"
  if [ -f "$ROOT/package.json" ]; then
    grep -nE '"name"|\"scripts\"' "$ROOT/package.json" || true
  else
    echo "(no package.json)"
  fi
  echo

  echo "## verification"
  echo "lint: not run"
  echo "build: not run"
} > "$OUT"

echo "wrote $OUT"