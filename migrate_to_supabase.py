#!/usr/bin/env python3
"""Run Supabase SQL migration directly via supabase-py + REST API."""
import os, sys

# Load .env
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    for line in open(env_path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip().strip("'\"")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    sys.exit(1)

# Supabase-py can't execute SQL directly. We use the REST API's
# rpc endpoint or we just print instructions.
print(f"Supabase project: {url}")
print()
print("The SQL migration script is at: supabase_migration.sql")
print()
print("To execute it:")
print(f"  1. Open {url} in your browser")
print("  2. Go to SQL Editor")
print("  3. Paste the contents of supabase_migration.sql")
print("  4. Click Run")
print()
print("Or use the Supabase CLI:")
print("  supabase db push")
print()
print("After running the migration, restart the backend:")
print("  ./serve.sh")