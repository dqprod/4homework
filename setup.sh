#!/usr/bin/env bash
# 4homework 一键环境搭建脚本 (macOS, Python 3.9+)
#
# 用法：
#   ./setup.sh           # 安装依赖 + 跑测试
#   ./setup.sh --no-test # 只装不跑
#   ./setup.sh --reset   # 删 homework.db / storage 后重建
#
# 退出码：
#   0 = 成功
#   1 = Python 版本不对
#   2 = pip 装包失败
#   3 = pytest 失败

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- 参数解析 ----
RUN_TESTS=1
RESET=0
for arg in "$@"; do
  case "$arg" in
    --no-test) RUN_TESTS=0 ;;
    --reset)   RESET=1 ;;
    -h|--help)
      sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ---- Python 检测 ----
PY="${PYTHON:-/usr/bin/python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "❌ Python not found at $PY" >&2
  echo "   Set PYTHON env var or install Python 3.9+." >&2
  exit 1
fi

PY_VERSION="$("$PY" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
PY_MAJOR="$(echo "$PY_VERSION" | cut -d. -f1)"
PY_MINOR="$(echo "$PY_VERSION" | cut -d. -f2)"

if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 9 ]; }; then
  echo "❌ Python $PY_VERSION < 3.9. Codebase requires 3.9+." >&2
  exit 1
fi
echo "✅ Python $PY_VERSION at $PY"

# ---- 可选 reset ----
if [ "$RESET" = 1 ]; then
  echo "🗑  Removing homework.db and storage/ ..."
  rm -f homework.db
  rm -rf storage storage_test .pytest_cache
  echo "   (these paths are .gitignore'd, so safe to delete)"
fi

# ---- 装依赖 ----
echo "📦 Installing pinned dependencies from requirements.lock.txt ..."
"$PY" -m pip install --user -r requirements.lock.txt

# ---- 跑测试（可选）----
if [ "$RUN_TESTS" = 1 ]; then
  echo "🧪 Running pytest ..."
  if "$PY" -m pytest -q; then
    echo ""
    echo "✅ All tests passed. Next steps:"
    echo "   $PY -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
    echo "   # then visit http://127.0.0.1:8000/docs"
  else
    echo "❌ pytest failed. See output above." >&2
    exit 3
  fi
else
  echo "✅ Dependencies installed. Skipping tests (--no-test)."
  echo "   Run manually: $PY -m pytest -v"
fi
