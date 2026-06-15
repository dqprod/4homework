#!/usr/bin/env bash
# 4homework 一键启动——用 Python 加载 .env 确保特殊字符正确处理
set -euo pipefail
cd "$(dirname "$0")"

# 用 Python 加载 .env 并导出到环境变量
eval "$(/usr/bin/python3 -c "
import os, re
env_file = '.env'
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            m = re.match(r'^([^=]+)=(.*)$', line)
            if m:
                k, v = m.group(1), m.group(2)
                # Remove surrounding quotes
                v = v.strip('\"'\"'\")
                print(f'export {k}={repr(v)}')
")"

# 自动选空闲端口
PORT="${1:-8000}"
for attempt in 8000 8001 8002 8003 8004 8005; do
    if ! lsof -i ":$attempt" > /dev/null 2>&1; then
        PORT=$attempt
        break
    fi
done

exec /usr/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"