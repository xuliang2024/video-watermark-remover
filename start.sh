#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "▶ 构建 React 前端（若尚未构建）..."
if [ ! -d "$ROOT_DIR/frontend/dist" ]; then
  (cd "$ROOT_DIR/frontend" && npm run build)
fi

echo "▶ 启动 净影 CleanFrame FastAPI 服务 (http://127.0.0.1:8000)..."
echo "  - 产品官网首页: http://127.0.0.1:8000/"
echo "  - 生产工作台:   http://127.0.0.1:8000/workspace"
echo "  - Swagger 文档: http://127.0.0.1:8000/docs"
cd "$ROOT_DIR/backend"
exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
