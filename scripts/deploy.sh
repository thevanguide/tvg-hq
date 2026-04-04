#!/usr/bin/env bash
#
# deploy.sh — Deploy The Van Guide site to Cloudflare Pages
#
# Keeps The Van Guide's Cloudflare account isolated from ECB by pulling the
# API token from macOS Keychain at deploy time. No wrangler login required,
# no account switching, no risk of accidental cross-account deploys.
#
# Setup (one-time):
#   1. Create a Cloudflare API token in the TVG Cloudflare account:
#      https://dash.cloudflare.com/profile/api-tokens
#      Template: "Edit Cloudflare Workers" or custom with:
#        - Account: Cloudflare Pages:Edit
#        - Account: Account Settings:Read
#        - User: User Details:Read
#   2. Find your TVG Cloudflare Account ID (dashboard → right sidebar)
#   3. Save both to Keychain:
#      security add-generic-password -a "$USER" -s "tvg-cf-token" -w "YOUR_TOKEN"
#      security add-generic-password -a "$USER" -s "tvg-cf-account-id" -w "YOUR_ACCOUNT_ID"
#
# Usage:
#   npm run deploy
#   ./scripts/deploy.sh

set -euo pipefail

PROJECT_NAME="thevanguide"
BUILD_DIR="dist"

echo "→ Reading Cloudflare credentials from Keychain..."

if ! CF_API_TOKEN=$(security find-generic-password -a "$USER" -s "tvg-cf-token" -w 2>/dev/null); then
  echo "ERROR: Cloudflare API token not found in Keychain."
  echo "  Run: security add-generic-password -a \"\$USER\" -s \"tvg-cf-token\" -w \"YOUR_TOKEN\""
  exit 1
fi

if ! CF_ACCOUNT_ID=$(security find-generic-password -a "$USER" -s "tvg-cf-account-id" -w 2>/dev/null); then
  echo "ERROR: Cloudflare Account ID not found in Keychain."
  echo "  Run: security add-generic-password -a \"\$USER\" -s \"tvg-cf-account-id\" -w \"YOUR_ACCOUNT_ID\""
  exit 1
fi

echo "→ Building Astro site..."
npm run build

echo "→ Deploying to Cloudflare Pages (project: $PROJECT_NAME)..."
CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" \
CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID" \
  npx wrangler pages deploy "$BUILD_DIR" \
    --project-name="$PROJECT_NAME" \
    --branch=main \
    --commit-dirty=true

echo "✓ Deploy complete."
