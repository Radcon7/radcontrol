#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/_repo_snapshot.txt"
PROJECT_KEY="radcontrol"
MODE="${1:-write}"

render() {
  cd "$ROOT"
  echo "RAD EMPIRE REPOSITORY SNAPSHOT"
  echo "contract: repo-snapshot/v1"
  echo "project: $PROJECT_KEY"
  echo
  echo "GOVERNANCE"
  for path in AGENTS.md README.md docs/REPO_STATE.md docs/SMOKE_TESTS.md; do
    [[ -f "$path" ]] && echo "$path"
  done
  echo
  echo "PACKAGE SCRIPTS"
  node -e 'const p=require("./package.json"); console.log(Object.keys(p.scripts||{}).sort().join("\n"))'
  echo
  echo "BOUNDED FILE INVENTORY"
  git ls-files --cached --others --exclude-standard | LC_ALL=C sort -u | awk '
    /^docs\/_repo_snapshot\.txt$/ { next }
    /^docs\/_o2_repo_index\.txt$/ { next }
    /(^|\/)(node_modules|\.next|coverage|dist|out|target|\.cache|\.temp|backups)(\/|$)/ { next }
    /(^|\/)\.env($|\.)/ && !/(^|\/)\.env\.example$/ { next }
    /\.(pem|key|p12|dump|tsbuildinfo)$/ { next }
    /\.tar\.gz$/ { next }
    { print }
  ' | sed -n '1,500p'
}

mkdir -p "$ROOT/docs"
first="$(mktemp)"
second="$(mktemp)"
trap 'rm -f "$first" "$second"' EXIT
render > "$first"

case "$MODE" in
  write) cp "$first" "$OUT" ;;
  --check) cmp -s "$first" "$OUT" || { diff -u "$OUT" "$first" || true; exit 1; } ;;
  --verify-idempotence) render > "$second"; cmp -s "$first" "$second" ;;
  *) echo "usage: $0 [--check|--verify-idempotence]" >&2; exit 2 ;;
esac

echo "snapshot $MODE: $OUT"
