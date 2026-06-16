# 用 Python 加载 .env 并导出到环境变量
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
                v = v.strip('"\'')
                print(f'export {k}={repr(v)}')
