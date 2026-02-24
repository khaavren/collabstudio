#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required to run Vercel deploy." >&2
  exit 1
fi

if [ ! -f package.json ]; then
  echo "Run this script from the project root." >&2
  exit 1
fi

# Preview deployment by default.
npx vercel deploy -y "$@"
