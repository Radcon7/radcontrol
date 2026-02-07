#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/_repo_snapshot.txt"

{
  echo "=== SNAPSHOT: RadControl ==="
  echo "root: $ROOT"
  echo "time: $(date)"
  echo

  echo "## identity"
  git rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/^/branch: /' || echo "branch: (no git)"
  git rev-parse HEAD 2>/dev/null | sed 's/^/commit: /' || echo "commit: (no git)"
  echo

  echo "## status"
  git status || true
  echo

  echo "## recent commits"
  git log -5 --oneline || true
  echo

  echo "## tree (depth 4)"
  tree -a -L 4 || true
  echo

  echo "## package.json (name + scripts)"
  if [ -f "$ROOT/package.json" ]; then
    grep -E '"name"|\"scripts\"' -n "$ROOT/package.json" || true
  else
    echo "(no package.json)"
  fi
  echo

  echo "## verification"
  echo "lint: not run"
  echo "build: not run"
} > "$OUT"

echo "wrote $OUT"