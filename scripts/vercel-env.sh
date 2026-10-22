#!/usr/bin/env bash
# Copies the variables from .env.local into Vercel (Production and Preview). Untested against your account:
# run `npx vercel login` and `npx vercel link` first, and check the result in Settings > Environment Variables.
# Usage: bash scripts/vercel-env.sh
set -eu
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo ".env.local not found"; exit 1; }
for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY CAPABILITY_SECRET \
            STORAGE_ENDPOINT STORAGE_BUCKET STORAGE_ACCESS_KEY_ID STORAGE_SECRET_ACCESS_KEY STORAGE_REGION APP_ORIGIN; do
  value=$(grep -E "^${name}=" .env.local | head -1 | cut -d= -f2- || true)
  if [ -z "$value" ]; then echo "skip $name (not set in .env.local)"; continue; fi
  for target in production preview; do
    printf '%s' "$value" | npx vercel env add "$name" "$target" --force >/dev/null 2>&1 && echo "set $name ($target)" || echo "FAILED $name ($target)"
  done
done
printf '1' | npx vercel env add ENABLE_DEMO production --force >/dev/null 2>&1 && echo "set ENABLE_DEMO"
echo "Done. Redeploy from the Vercel dashboard to apply."
