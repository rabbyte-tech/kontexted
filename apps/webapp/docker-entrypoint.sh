#!/bin/sh
set -e

if [ -z "${DATABASE_URL}" ]; then
  echo "DATABASE_URL is required but not set"
  exit 1
fi

echo "Waiting for postgres to be ready..."
until pg_isready -d "${DATABASE_URL}" > /dev/null 2>&1; do
  echo "Postgres is unavailable - sleeping"
  sleep 1
done

echo "Postgres is ready! Running migrations..."
cd /app/apps/webapp && bun db:migrate && cd /app

echo "Migrations completed. Starting webapp..."
cd /app/apps/webapp && exec bun start
