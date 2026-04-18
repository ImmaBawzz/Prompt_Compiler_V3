#!/bin/bash
# Pre-commit hook: auto-detect and fix missing modules/types
set -e
npx tsc --noEmit || {
  echo "Type check failed. Attempting to auto-install missing modules..."
  grep -oE "Cannot find module '[^']+'" < <(npx tsc --noEmit) | awk -F\' '{print $2}' | xargs -r npm install || true
  npx tsc --noEmit
}
