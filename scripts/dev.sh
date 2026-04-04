#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
echo "dev.sh starting, PATH=$PATH, pwd=$(pwd)" >&2
exec /opt/homebrew/bin/node node_modules/astro/astro.js dev
