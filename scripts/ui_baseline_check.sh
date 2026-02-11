#!/usr/bin/env bash
set -euo pipefail

echo "=== RadControl UI Baseline Check ==="
echo
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
echo
git status --porcelain || true
echo
echo "--- CSS layout invariants (must exist) ---"
grep -nE "min-height: 0|min-width: 0|height: 100%|100vh|grid-template-columns|logsBar|logsDock" src/App.css || true
echo
echo "--- App.tsx tabs sanity (must NOT include Intervention) ---"
grep -n "Intervention" src/App.tsx || echo "OK: no Intervention"