#!/bin/sh
set -e

echo "🔄 Running Prisma migrations..."

# Tạo CJS config tạm thời để Prisma CLI đọc được
cat > /app/prisma.config.cjs << EOF
const { defineConfig } = require("prisma/config");
module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
EOF

cd /app && node_modules/.bin/prisma migrate deploy --config prisma.config.cjs \
  && echo "✅ Migrations done!" \
  || echo "⚠️  Migration failed or no migrations to run"

rm -f /app/prisma.config.cjs

echo "🚀 Starting server..."
exec node dist/src/server.js
