#!/usr/bin/env bash
set -euo pipefail

# Retain this historical entrypoint only so an old operator command fails
# explicitly. A standalone RadControl install would violate the live product
# contract by advancing the binary independently from its compatible O2 root.
printf '%s\n' \
  'Refusing independent RadControl installation: scripts/install_production.sh is retired.' \
  'Advance the installed O2 runtime and RadControl binary only through one reviewed native-acceptance transaction with fixed source identities, artifact hashes, rollback, and re-upgrade proof.' >&2
exit 64
