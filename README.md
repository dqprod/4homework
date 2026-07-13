# 4homework — 后端完整实现

`homework_learn.md` 设计文档的**全量后端实现**。覆盖该文档定义的 7 表数据库、9 个 API 端点、艾宾浩斯复习计划算法、Mock/Real AI 客户端、Supabase 适配层。

## 🎯 与 md 设计文档的对齐矩阵

| md 要求的模块 | 状态 | 说明 |
|---|---|---|
| **1. 数据库 (7 表)** | ✅ | `profiles`、`subjects`、`problems`、`review_schedules`、`review_records`、`parent_child`、`ai_error_logs` |
| **2. 艾宾浩斯算法** | ✅ | `intervals=[1,2,4,7,15,30]`，推进 + 回滚纯函数，6 单测 |
| **3. AI 客户端** | ✅ | Mock（哈希确定性）、Real（Nvidia API vision chat-completions）、JSON 解析 + markdown fence 处理 + 非 JSON fallback |
| **4. 存储** | ✅ | 本地文件 (Phase 1) / Supabase Storage (Phase 2 就绪) |
| **5. 鉴权** | ✅ | `X-User-Id` header (Phase 1) / `Authorization: Bearer <JWT>` via Supabase Auth (Phase 2 就绪) |
| **6. API 端点 (9 个)** | ✅ | 见下方 |
| **7. UI 画面** | ❌ | Phase 3 (Next.js) |
| **8. 异步任务** | ❌ | Phase 3 (BackgroundTasks/Celery) |
| **9. 部署** | ❌ | Phase 3 (Vercel + 云服务) |

### API 端点映射

| 端点 | md 章节 | 功能 |
|---|---|---|
| `POST /upload` | B2 / API#1 | 上传图片 → AI 解析 → 建 problem + 艾宾浩斯 stage 0 |
| `GET /problems` | B3 / API#2 | 分页列表，学科筛选，家长可看孩子 |
| `GET /problems/{id}` | B5 / API#3 | 单题详情 + 全部复习计划 |
| `DELETE /problems/{id}` | B3 / API#4 | 删题（CASCADE 复习计划 + 删 storage） |
| `GET /reviews` | B4b / API#5 | 复习列表，日期/状态/用户多维度筛 |
| `PUT /reviews/{id}/status` | B4b / API#6 | 标记完成（艾宾浩斯推进）/ 未完成（回滚） |
| `GET /parent/overview` | C2 / API#7 | 学习概览：总数、学科分布、完成率、逾期 |
| `POST /parent/child` | D2 / API#8 | 关联孩子（by id 或 email） |
| `DELETE /parent/child/{id}` | D2 / API#9 | 解除关联 |
| `PATCH /profiles` | D1 | 更新姓名/用户名/头像 |
| `GET /subjects` | — | 返回 5 个 seed 学科 |
| `GET /health` | — | 健康检查 |

## 📦 项目结构

```
4homework/
├── app/
│   ├── api/                    # FastAPI routers
│   │   ├── upload.py           # POST /upload
│   │   ├── problems.py         # GET /problems, GET /problems/{id}, DELETE /problems/{id}
│   │   ├── reviews.py          # GET /reviews, PUT /reviews/{id}/status
│   │   ├── parent.py           # GET /parent/overview, POST /parent/child, DELETE /parent/child/{id}
│   │   ├── profiles.py         # PATCH /profiles
│   │   └── subjects.py         # GET /subjects
│   ├── models/__init__.py      # 7 张表 SQLAlchemy ORM
│   ├── schemas/__init__.py     # Pydantic v2 request/response
│   ├── services/
│   │   ├── __init__.py         # Ebbinghaus 算法（纯函数）
│   │   ├── ai_client.py        # MockAIClient + RealNvidiaClient + 解析器
│   │   ├── storage.py          # 本地/Supabase 存储适配器
│   │   ├── supabase_client.py  # Supabase 客户端单例
│   │   ├── supabase_auth.py    # JWT 鉴权（备用）
│   │   └── supabase_storage.py # Supabase Storage（备用）
│   ├── auth.py                 # current_user：按 backend 分发 JWT / X-User-Id
│   ├── config.py               # env 配置（frozen dataclass）
│   ├── db.py                   # async engine + init_db + seed subjects
│   └── main.py                 # FastAPI app 入口 + lifespan init
├── tests/
│   ├── conftest.py             # in-memory SQLite + 每测试清表重 seed
│   ├── test_ebbinghaus.py      # Ebbinghaus 算法（6 测试）
│   ├── test_api.py             # 全部端点端到端（33 测试）
│   └── test_ai_client.py       # RealNvidiaClient 解析（7 测试）
├── requirements.lock.txt       # 精确版本锁定（Python 3.9 + Supabase 2.5.3）
├── requirements.txt            # 设计意图版本（上下限）
├── setup.sh                    # 一键搭建脚本
├── pytest.ini
├── .env.example
├── .gitignore
└── README.md
```

## 🚀 启动

```bash
cd ~/Documents/projects/4homework/4homework

# 一键搭建（推荐）
./setup.sh

# 起服务
/usr/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 打开 Swagger
open http://127.0.0.1:8000/docs
```

## 🧪 测试

```bash
/usr/bin/python3 -m pytest -v
# 40 passed in 0.47s
```

## 🔌 关键接口契约

### POST /upload

**Request:** `multipart/form-data` with `file` (image, <5MB) + `subject_id` (int)

**Response (201):** problem_id, subject_name, problem_text (AI parsed), solution_steps, final_answer, review_schedule (stage 0, scheduled_date = today + 1 day)

**Error handling:** AI 解析失败 → 写入 `ai_error_logs`，题目仍以文本"(AI 解析に失敗しました)"创建

### PUT /reviews/{id}/status

**Request:** `{"completed": true|false}`

**Completed** → Ebbinghaus 推进：stage += 1, scheduled_date = date + intervals[min(stage, 5)]

**Not completed** → 回滚：保留原 scheduled_date，清 completed/completed_at

### GET /parent/overview

**Query:** `child_id` (required)

**Response:** total_problems, problems_by_subject (dict), total_study_time_minutes, review_completion_rate (0..1), upcoming_reviews, overdue_reviews

### 鉴权

- **SQLite 模式 (默认):** 发送 `X-User-Id: <profile_id>` header
- **Supabase 模式:** 发送 `Authorization: Bearer <JWT>`, 回退到 X-User-Id

## 🐘 数据库表（7 表）

| 表 | md 设计 | 实现 |
|---|---|---|
| `profiles` | id, username, full_name, role, child_id, avatar_url, created_at | ✅ + server_default CURRENT_TIMESTAMP |
| `subjects` | id, name, icon | ✅ seed 算/国/理/社/英 |
| `problems` | id, user_id, subject_id, image_url, text, steps, answer, study_time, raw, created_at | ✅ + FK cascade + indexes on user_id, subject_id, created_at |
| `review_schedules` | id, problem_id, user_id, stage, scheduled_date, completed, completed_at, interval, created/updated | ✅ + 4 indexes on user_id, scheduled_date, problem_id, (user+scheduled) |
| `review_records` | id, schedule_id, problem_id, user_id, reviewed_at, difficulty 1-5, notes | ✅ + CHECK constraint |
| `parent_child` | parent_id, child_id, created_at | ✅ composite PK |
| `ai_error_logs` | id, user_id, image_url, request/response, error, occurred_at | ✅ |

## 🔮 Phase 3 路线图（Next.js 前端）

1. **Next.js App Router 项目** — `npm create next-app@latest frontend/`
2. **Supabase Auth 集成** — Login/Signup + JWT → 后端鉴权
3. **画面**：上传组件 (B2) → 学习记录列表 (B3) → 日历视图 (B4a) → 复习列表 (B4b) → 题目详情 (B5) → 家长仪表盘 (C2)
4. **异步任务**：AI 调用入 BackgroundTasks / Celery，前端轮询结果
5. **通知**：Email / 应用内复习提醒







备注

git add supabase/functions/upload/index.ts && git commit -m "fix: chunked base64 encoding to prevent stack overflow" && git push && supabase functions deploy upload 2>&1
