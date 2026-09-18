#!/bin/bash
# Сборка статического экспорта планировщика для внешнего хостинга (Surge.sh)
# Временно подменяет next.config.ts и убирает API-роут, затем восстанавливает.
set -e
cd /home/z/my-project

export NEXT_TELEMETRY_DISABLED=1

echo "1/5 Backup next.config.ts and api route..."
cp next.config.ts /tmp/next.config.standalone.bak
mv src/app/api /tmp/api-route-backup

echo "2/5 Write export config..."
cat > next.config.ts <<'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
EOF

echo "3/5 Build static export..."
if bunx next build; then
  BUILD_OK=1
else
  BUILD_OK=0
fi

echo "4/5 Restore original config and api route..."
cp /tmp/next.config.standalone.bak next.config.ts
rm -rf /tmp/next.config.standalone.bak
if [ -d /tmp/api-route-backup ]; then
  mv /tmp/api-route-backup src/app/api
fi

if [ "$BUILD_OK" != "1" ]; then
  echo "BUILD FAILED"
  exit 1
fi

echo "5/5 Verify output..."
ls out/ | head -20
test -f out/index.html && echo "OK: out/index.html exists" || { echo "FAIL: no index.html"; exit 1; }
du -sh out/
