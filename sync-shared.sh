#!/bin/bash
# sync-shared.sh
# Syncs shared/ directory to clipstash-desktop/src/shared/
# Run after modifying any file in shared/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/shared"
DEST_DESKTOP="$SCRIPT_DIR/clipstash-desktop/src/shared"

echo "Syncing shared/ -> clipstash-desktop/src/shared/"
rsync -av --delete \
  --exclude='vendor/' \
  --exclude='node_modules/' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  --exclude='build-cm6.mjs' \
  --exclude='cm6-bundle.js' \
  "$SRC/" "$DEST_DESKTOP/"

echo "Done."
