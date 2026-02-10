#!/bin/sh
set -e

if [ -z "${DATABASE_URL}" ]; then
  echo "DATABASE_URL is required but not set"
  exit 1
fi

echo "Running migrations..."
bun dist/db/migrate.js

echo "Migrations completed. Starting server..."
exec bun dist/index.js
