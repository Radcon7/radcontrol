#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "O2 session start — RadControl"
echo "root: $ROOT"
echo

pwd
git rev-parse --show-toplevel || true
echo

echo "git status:"
git status || true
echo

echo "running repo index..."
"$ROOT/scripts/o2_index_repo.sh"
echo

echo "running snapshot..."
"$ROOT/scripts/snapshot_repo_state.sh"
echo
echo "done"