#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "▶ 构建 React 前端..."
(cd "$ROOT_DIR/frontend" && npm run build)

PYTHON_BIN="python3"
if ! "$PYTHON_BIN" -c "import uvicorn" >/dev/null 2>&1; then
  for candidate in /opt/homebrew/bin/python3 /opt/homebrew/opt/python@3.11/bin/python3.11 /usr/local/bin/python3; do
    if [ -x "$candidate" ] && "$candidate" -c "import uvicorn" >/dev/null 2>&1; then
      PYTHON_BIN="$candidate"
      break
    fi
  done
fi

echo "▶ 启动 净影 CleanFrame FastAPI 服务 (http://127.0.0.1:8000)..."
echo "  - 产品官网首页: http://127.0.0.1:8000/"
echo "  - 生产工作台:   http://127.0.0.1:8000/workspace"
echo "  - 系统环境设置: http://127.0.0.1:8000/workspace#settings"
echo "  - Swagger 文档: http://127.0.0.1:8000/docs"
cd "$ROOT_DIR/backend"
exec "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
