理解需求,设计方案。我们将基于你提出的技术栈（Next.js + FastAPI + Supabase）进行设计，并补充你考虑不足的细节。

**项目核心目标：** 开发一个供日本小学生使用的学习辅助Web应用，通过拍照上传作业题（算数、国语、理科、社会、英语），调用Nvidia MiniMax 3 AI API解析题目内容，生成结构化学习记录（题目、思路、答案），并基于艾宾浩斯记忆曲线智能安排复习计划。家长和学习者可通过历史记录进行复习。

**技术栈确认：**
1.  **前端:** Next.js (App Router 模式推荐，功能更现代)
2.  **后端:** FastAPI (Python，高效处理API和AI调用)
3.  **数据库:** Supabase (PostgreSQL，提供认证、存储、实时能力)
4.  **AI服务:** Nvidia MiniMax 3 AI API (替代OpenAI API)
5.  **图片存储:** Supabase Storage (集成方便)
6.  **部署:** Vercel (Next.js) + 支持Python的云服务 (如 Render, Fly.io, AWS ECS/EB) / Supabase Edge Functions (可选部分逻辑)

**重新整理的核心需求与设计原则：**

1.  **核心流程:** 用户上传题目图片 -> 后端调用Nvidia MiniMax 3 AI解析 -> 后端处理AI响应，提取题目、思路、答案、预估学习时间 -> 后端应用艾宾浩斯算法生成复习计划 -> 数据存储 -> 用户查看学习历史和复习计划。
2.  **用户角色:** 学习者 (小学生)， 家长 (查看孩子进度、监督复习)。
3.  **关键功能:**
    *   用户认证 (Supabase Auth)
    *   图片上传与管理 (Supabase Storage)
    *   AI题目解析 (Nvidia MiniMax 3 API)
    *   学习记录创建 (题目、思路、答案、学科、原始图片链接、学习时间戳)
    *   **艾宾浩斯复习计划生成与更新** (核心算法)
    *   学习历史查看与搜索/过滤 (按学科、日期、复习状态)
    *   复习计划日历/列表视图
    *   复习记录标记 (完成/未完成)
    *   (家长视图) 孩子学习概览、进度追踪
4.  **非功能需求:**
    *   **UI/UX:** 简洁、直观、对小学生友好，响应式设计。
    *   **数据验证:** 严格验证前端输入、API请求、数据库操作。
    *   **性能:** 优化图片上传/加载、AI调用响应、数据库查询。
    *   **安全性:** 保护用户数据、API密钥、防止注入攻击。
    *   **健壮性:** 优雅处理AI解析失败、网络错误、并发问题。
    *   **可维护性:** 清晰代码结构、模块化设计、良好文档。

**系统架构图 (概念简化):**

```
[User Browser] <--(HTTP/HTTPS)--> [Next.js Frontend (Vercel)]
                                      |
                                      | (API Calls)
                                      v
[FastAPI Backend (Python Host)] <---> [Supabase]
                                      |   |   |
                                      |   |   |--- Auth (Users)
                                      |   |   |--- PostgreSQL DB (Learning Records, Subjects, Reviews)
                                      |   |   |--- Storage (Image Files)
                                      |
                                      | (Nvidia MiniMax 3 API Call)
                                      v
                                  [Nvidia MiniMax 3 AI Platform]
```

**数据库设计 (Supabase PostgreSQL - 核心表):**

1.  **`profiles` (扩展自`auth.users`):**
    *   `id` (UUID, PK, FK `auth.users.id`)
    *   `username` (VARCHAR)
    *   `full_name` (VARCHAR)
    *   `role` (VARCHAR, ENUM: `'student'`, `'parent'`) -- 区分用户角色
    *   `child_id` (UUID, FK `profiles.id` NULLABLE) -- *家长关联孩子(学生)ID*
    *   `avatar_url` (TEXT) -- 头像链接
    *   `created_at` (TIMESTAMPTZ)

2.  **`subjects` (学科元数据):**
    *   `id` (SERIAL, PK)
    *   `name` (VARCHAR, UNIQUE, NOT NULL) -- "算数", "国语", "理科", "社会", "英语"
    *   `icon` (VARCHAR) -- 可选，前端显示图标

3.  **`problems` (题目核心信息):**
    *   `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
    *   `user_id` (UUID, NOT NULL, FK `profiles.id`) -- 上传者(学习者)
    *   `subject_id` (INT, NOT NULL, FK `subjects.id`)
    *   `original_image_url` (TEXT, NOT NULL) -- Supabase Storage URL
    *   `problem_text` (TEXT, NOT NULL) -- AI 解析出的题目文本
    *   `solution_steps` (TEXT) -- AI 解析出的解题思路/步骤 (Markdown?)
    *   `final_answer` (TEXT) -- AI 解析出的最终答案
    *   `estimated_study_time` (INT) -- AI 预估或系统默认的学习时间(分钟)
    *   `ai_response_raw` (JSONB) -- *存储Nvidia MiniMax 3 API返回的原始JSON，用于调试和可能的后续处理*
    *   `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `now()`)

4.  **`review_schedules` (复习计划 - 核心算法表):**
    *   `id` (UUID, PK, DEFAULT `gen_random_uuid()`)
    *   `problem_id` (UUID, NOT NULL, FK `problems.id`, ON DELETE CASCADE) -- 关联的题目
    *   `user_id` (UUID, NOT NULL, FK `profiles.id`) -- 学习者
    *   `review_stage` (INT, NOT NULL, DEFAULT 0) -- 当前复习阶段 (0=新学, 1, 2, 3, ... 对应艾宾浩斯间隔)
    *   `scheduled_date` (DATE, NOT NULL) -- 计划复习日期
    *   `completed` (BOOLEAN, NOT NULL, DEFAULT FALSE) -- 是否已完成本次复习
    *   `completed_at` (TIMESTAMPTZ) -- 完成复习的时间戳
    *   `next_review_interval` (INT) -- *计算出的距离下一次复习的天数(基于stage)*
    *   `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `now()`)
    *   `updated_at` (TIMESTAMPTZ) -- 记录更新时间

5.  **`review_records` (复习记录):** *(可选，用于更详细跟踪复习表现)*
    *   `id` (UUID, PK)
    *   `review_schedule_id` (UUID, NOT NULL, FK `review_schedules.id`)
    *   `problem_id` (UUID, NOT NULL, FK `problems.id`)
    *   `user_id` (UUID, NOT NULL, FK `profiles.id`)
    *   `reviewed_at` (TIMESTAMPTZ, NOT NULL, DEFAULT `now()`)
    *   `difficulty_rating` (INT, CHECK 1-5) -- *用户反馈本次复习难度*
    *   `notes` (TEXT) -- *用户复习笔记*

6.  **`parent_child` (家长-孩子关系):** *(如果`profiles.child_id`不够灵活，可独立成表)*
    *   `parent_id` (UUID, PK, FK `profiles.id`)
    *   `child_id` (UUID, PK, FK `profiles.id`)
    *   `created_at` (TIMESTAMPTZ)

7.  **`ai_error_logs` (错误日志):** *用于监控AI解析失败*
    *   `id` (SERIAL, PK)
    *   `user_id` (UUID, FK `profiles.id`)
    *   `image_url` (TEXT)
    *   `request_payload` (JSONB)
    *   `response_payload` (JSONB)
    *   `error_message` (TEXT)
    *   `occurred_at` (TIMESTAMPTZ, DEFAULT `now()`)

**艾宾浩斯算法实现 (FastAPI后端):**
*   **初始阶段:** 题目首次创建时 (`review_stage=0`)，`scheduled_date` = `created_at` + `initial_interval` (e.g., 1天)。
*   **复习完成:** 当用户标记一次复习完成时：
    1.  根据当前 `review_stage` 查找预设的间隔天数 (e.g., `intervals = [1, 2, 4, 7, 15, 30]`)。
    2.  计算下次复习日期：`next_date = completion_date + intervals[stage]`。
    3.  更新 `review_schedules`:
        *   `completed` = `TRUE`
        *   `completed_at` = `now()`
        *   `review_stage` = `review_stage + 1`
        *   `next_review_interval` = `intervals[review_stage]` (或`intervals[review_stage]` 如果存在，否则用最大值或自定义逻辑)
        *   `scheduled_date` = `next_date`
        *   `updated_at` = `now()`
*   **未完成处理:** 如果用户跳过复习，可以：
    *   保持原计划日期，标记为“逾期”。
    *   或在某个时间点自动重新安排（需谨慎，避免堆积）。
*   **配置化:** 将间隔天数存储在配置或数据库表中，方便调整。

**UI 画面设计与功能分解 (Next.js App Router):**

*   **A. 认证流程 (Auth Flow)**
    *   **A1: `/login` (登录页面)**
        *   动作: 用户输入邮箱/密码，或点击第三方登录 (Supabase Auth)。
        *   事件: `onSubmit` -> 调用 `supabase.auth.signInWithPassword()` 或 `signInWithOAuth()`。
        *   API: Supabase Auth API (Client-side)。
    *   **A2: `/signup` (注册页面)**
        *   动作: 用户输入邮箱、密码、姓名、选择角色 (学生/家长)、家长需关联孩子邮箱/ID。
        *   事件: `onSubmit` -> 调用 `supabase.auth.signUp()` -> 成功后调用 `POST /api/profiles` 创建/更新`profiles`记录。
        *   API: Supabase Auth API (Client-side) + 自定义 `POST /api/profiles` (Next.js API Route -> FastAPI)。
        *   数据验证: 邮箱格式、密码强度、姓名非空、角色有效、家长关联的孩子ID存在且是学生角色。
    *   **A3: `/forgot-password` (忘记密码)**
        *   动作: 用户输入邮箱。
        *   事件: `onSubmit` -> 调用 `supabase.auth.resetPasswordForEmail()`。
        *   API: Supabase Auth API (Client-side)。
    *   **A4: `/update-password` (重置密码 - 通常由邮件链接进入)**
        *   动作: 用户输入新密码。
        *   事件: `onSubmit` -> 调用 `supabase.auth.updateUser({ password })`。
        *   API: Supabase Auth API (Client-side)。

*   **B. 主应用 (Main App - `/dashboard`)**
    *   **B1: 导航栏 (Navbar)**
        *   显示: 用户头像/姓名、学科筛选下拉菜单、通知(复习提醒)、登出按钮。
        *   事件: 点击学科筛选 -> 更新全局状态/URL查询参数；点击通知 -> 跳转到复习列表；点击登出 -> `supabase.auth.signOut()`。
    *   **B2: 上传区域 (Upload Area)**
        *   组件: 文件拖放区 + “选择文件”按钮 + 相机拍照按钮 (需要浏览器支持)。
        *   动作: 用户拖放/选择1张或多张图片，或调用摄像头拍照。
        *   事件: `onDrop`/`onChange` -> 前端校验图片类型/大小 -> 显示预览缩略图 -> 用户选择学科 -> 点击“上传并解析”按钮。
        *   API: 点击按钮后 -> 调用 `POST /api/upload` (Next.js API Route)。
        *   数据验证 (前端): 文件类型(image/*), 文件大小(e.g., <5MB), 至少一张图片, 学科已选。
    *   **B3: 学习记录时间线/列表 (Learning History Timeline/List)**
        *   视图: 可按时间倒序或按学科分组显示 `problems` 记录。
        *   组件: 卡片 (`ProblemCard`)，包含: 缩略图、学科图标、题目摘要、学习日期、复习状态标签、操作按钮(查看详情、删除)。
        *   动作: 用户滚动加载更多、点击卡片查看详情、点击删除按钮。
        *   事件: 滚动 -> 分页加载更多 (调用 `GET /api/problems?page=N`); 点击卡片 -> 导航到详情页 (`/problem/[id]`); 点击删除 -> 确认弹窗 -> 调用 `DELETE /api/problems/[id]`。
        *   API: `GET /api/problems` (带分页、学科、时间过滤), `DELETE /api/problems/[id]` (Next.js API Route -> FastAPI)。
    *   **B4: 复习计划视图 (Review Schedule View)**
        *   **B4a: 日历视图 (Calendar View)**
            *   组件: 月/周日历组件 (如 `react-calendar`)。
            *   显示: 在对应日期上标记有复习计划的点 (数量或图标)，点击日期显示当天复习任务列表。
            *   数据: 基于 `review_schedules.scheduled_date` 和 `user_id` 查询。
        *   **B4b: 列表视图 (List View)**
            *   组件: 表格或卡片列表 (`ReviewTaskCard`)。
            *   显示: 复习任务 (关联的题目摘要、学科、计划日期、状态-待复习/已完成/逾期)、操作按钮(标记完成/未完成)。
            *   排序: 按计划日期 (临近的优先)、状态。
            *   动作: 用户点击“标记完成”/“标记未完成”按钮、点击任务查看关联题目详情。
            *   事件: 点击状态按钮 -> 调用 `PUT /api/reviews/[id]/status` 更新 `review_schedules.completed` 并触发艾宾浩斯计算；点击任务 -> 导航到 `/problem/[problem_id]`。
            *   API: `GET /api/reviews` (按用户、日期范围、状态查询), `PUT /api/reviews/[id]/status` (Next.js API Route -> FastAPI)。
    *   **B5: 题目详情页 (`/problem/[id]`)**
        *   显示: 大图预览、学科、题目文本、解题思路/步骤、最终答案、学习时间、上传时间、关联的复习计划列表(日期、状态)。
        *   动作: 用户查看内容、标记关联的复习任务状态(如果在此页提供按钮)。
        *   API: `GET /api/problems/[id]` (包含关联的 `review_schedules`)。

*   **C. 家长视图 (Parent View - `/parent-dashboard`)**
    *   **C1: 孩子选择**
        *   组件: 下拉菜单或卡片列表 (如果关联多个孩子)。
        *   动作: 家长选择要查看的孩子。
        *   事件: 选择 -> 更新全局状态/URL查询参数。
    *   **C2: 学习概览 (Learning Overview)**
        *   组件: 统计卡片/图表。
        *   显示: 选定孩子最近一周/月的学习题目数量 (按学科分布)、总学习时间、复习完成率、近期复习计划概览。
        *   API: `GET /api/parent/overview?child_id=XYZ` (FastAPI聚合查询`problems`和`review_schedules`)。
    *   **C3: 孩子学习历史 (Child's Learning History)**
        *   类似 B3，但数据限定于选定孩子 (`child_id`)。
        *   API: `GET /api/problems?user_id=CHILD_ID` (需后端验证家长权限)。
    *   **C4: 孩子复习计划 (Child's Review Schedule)**
        *   类似 B4，但数据限定于选定孩子 (`child_id`)。
        *   API: `GET /api/reviews?user_id=CHILD_ID` (需后端验证家长权限)。

*   **D. 设置页面 (`/settings`)**
    *   **D1: 个人资料设置**
        *   动作: 修改姓名、头像、密码。
        *   事件: `onSubmit` -> 调用 `PATCH /api/profiles` 和/或 `supabase.auth.updateUser`。
        *   API: `PATCH /api/profiles`, Supabase Auth API。
    *   **D2: 孩子管理 (家长角色)**
        *   动作: 添加/移除关联的孩子 (输入孩子注册邮箱或ID)。
        *   事件: `onSubmit` -> 调用 `POST/DELETE /api/parent/child`。
        *   API: `POST/DELETE /api/parent/child` (操作 `parent_child` 表)。
        *   数据验证: 孩子邮箱/ID存在且是学生角色，不能重复关联。

**后端API规划 (FastAPI - 核心端点):**

1.  **`POST /upload`**:
    *   **输入:** FormData (`files[]` - 图片文件, `subject_id` - 学科ID)。
    *   **动作:**
        1.  验证用户认证 (JWT)。
        2.  验证输入 (文件存在、类型、大小；学科ID有效)。
        3.  上传图片到 Supabase Storage，获取URL。
        4.  构建 Nvidia MiniMax 3 API 请求 (Prompt 需精心设计，明确要求返回题目、思路、答案、预估时间)。
        5.  调用 Nvidia MiniMax 3 API (异步处理，避免阻塞)。
        6.  解析 Nvidia MiniMax 3 响应，提取所需字段 (处理可能的解析失败)。
        7.  创建 `problems` 记录。
        8.  **应用艾宾浩斯算法:** 为该题目创建初始 `review_schedules` 记录 (`stage=0`, `scheduled_date=now + 1 day` 等)。
        9.  返回新创建的 `problem` 信息 (包括初始复习计划)。
    *   **输出:** 新 `problem` 的 JSON (或错误信息)。
    *   **关键:** 精心设计Prompt、健壮的错误处理（存储失败记录到 `ai_error_logs`）、异步任务处理 (Celery/RQ 或 FastAPI BackgroundTasks)。

2.  **`GET /problems`**:
    *   **输入:** 查询参数 (`page`, `limit`, `subject_id`, `start_date`, `end_date`, `user_id` - *仅供家长/管理员*)。
    *   **动作:**
        1.  验证用户认证。
        2.  构建查询 (基于用户ID - 学生查自己，家长查孩子需验证权限)。
        3.  分页查询 `problems` 表 (可能关联 `subjects`, `review_schedules` 获取最近状态)。
        4.  返回分页结果列表。
    *   **输出:** `{ problems: [...], total: N, page: P, limit: L }`。

3.  **`GET /problems/{problem_id}`**:
    *   **输入:** `problem_id` (路径参数)。
    *   **动作:**
        1.  验证用户认证。
        2.  验证用户有权访问该题目 (题目所有者或家长关联的孩子)。
        3.  查询 `problems` 表 (关联 `subjects`, `review_schedules` 获取所有复习计划)。
        4.  返回题目详情。
    *   **输出:** 单个 `problem` 的详细 JSON。

4.  **`DELETE /problems/{problem_id}`**:
    *   **输入:** `problem_id` (路径参数)。
    *   **动作:**
        1.  验证用户认证。
        2.  验证用户是题目所有者。
        3.  删除关联的 `review_schedules` (CASCADE)。
        4.  删除 Supabase Storage 中的图片 (可选，或标记删除)。
        5.  删除 `problems` 记录。
        6.  返回成功状态。
    *   **输出:** 成功消息。

5.  **`GET /reviews`**:
    *   **输入:** 查询参数 (`scheduled_date` - 按天, `range_start`/`range_end` - 按范围, `status` - 待复习/已完成/逾期, `user_id` - *仅供家长/管理员*)。
    *   **动作:**
        1.  验证用户认证。
        2.  构建查询 (基于用户ID - 学生查自己，家长查孩子需验证权限)。
        3.  查询 `review_schedules` 表 (关联 `problems`, `subjects`)。
        4.  返回复习任务列表。
    *   **输出:** 复习任务列表 JSON。

6.  **`PUT /reviews/{review_id}/status`**:
    *   **输入:** `review_id` (路径参数), Body: `{ completed: boolean }`。
    *   **动作:**
        1.  验证用户认证。
        2.  验证用户有权操作该复习任务 (任务所有者)。
        3.  更新 `review_schedules.completed` 和 `completed_at`。
        4.  **如果标记为完成:**
            *   查找当前 `review_stage`。
            *   根据预设间隔表计算下次复习日期 (`scheduled_date = now() + interval[stage]`)。
            *   更新 `review_stage = stage + 1`, `scheduled_date`, `next_review_interval`, `updated_at`。
        5.  **如果标记为未完成:**
            *   重置 `completed` 和 `completed_at` (可选: 保持 `scheduled_date` 为原计划或标记为逾期)。
        6.  返回更新后的复习任务信息。
    *   **输出:** 更新后的 `review_schedule` 的 JSON。

7.  **`GET /parent/overview?child_id=...`**:
    *   **输入:** `child_id` (查询参数)。
    *   **动作:**
        1.  验证用户认证且是家长。
        2.  验证 `child_id` 是该家长的关联孩子。
        3.  执行聚合查询 (计算题目数/学科分布、学习时间总和、复习完成率统计、即将到来的复习任务)。
        4.  返回统计数据。
    *   **输出:** 包含各种统计指标的 JSON 对象。

8.  **`POST /parent/child`**:
    *   **输入:** Body: `{ child_email: string }` 或 `{ child_id: uuid }`。
    *   **动作:**
        1.  验证用户认证且是家长。
        2.  根据邮箱或ID查找孩子 `profiles` 记录 (必须是`role='student'`)。
        3.  检查关联是否已存在 (`parent_child` 表)。
        4.  创建新的 `parent_child` 记录。
        5.  返回成功状态。
    *   **输出:** 成功消息。

9.  **`DELETE /parent/child/{child_id}`**:
    *   **输入:** `child_id` (路径参数)。
    *   **动作:**
        1.  验证用户认证且是家长。
        2.  验证 `child_id` 是该家长的关联孩子。
        3.  删除 `parent_child` 记录。
        4.  返回成功状态。
    *   **输出:** 成功消息。

**完整开发任务列表 (按功能模块/画面编号):**

**模块 0: 项目搭建与环境配置 (Foundation)**
*   T0-01: 初始化 Next.js 项目 (App Router)。
*   T0-02: 初始化 FastAPI 项目。
*   T0-03: 配置 Supabase 项目 (创建数据库、启用Auth、创建Storage Bucket)。
*   T0-04: 配置环境变量 (Supabase URL/Key, Nvidia MiniMax 3 API Key, 后端URL等)。
*   T0-05: 配置 Next.js 与 Supabase Auth 集成 (`@supabase/auth-helpers-nextjs` 或 `@supabase/ssr`)。
*   T0-06: 配置 FastAPI 与 Supabase (管理数据库连接、Storage)。
*   T0-07: 定义共享数据模型 (TypeScript Interfaces / Python Pydantic Models)。
*   T0-08: 设计并创建 Supabase 数据库表 (执行SQL迁移脚本)。
*   T0-09: 配置 Nvidia MiniMax 3 API 客户端 (FastAPI)。

**模块 A: 认证流程 (Auth Flow)**
*   T1-01 (A1): 开发 `/login` 页面 UI (表单)。
*   T1-02 (A1): 实现登录表单提交逻辑 (调用 Supabase Auth)。
*   T1-03 (A1): 处理登录错误反馈。
*   T1-04 (A2): 开发 `/signup` 页面 UI (表单 - 邮箱, 密码, 姓名, 角色, 孩子关联字段)。
*   T1-05 (A2): 实现注册表单提交逻辑 (调用 Supabase Auth + 创建/更新 `profiles`)。
*   T1-06 (A2): 实现家长关联孩子的逻辑 (查找孩子ID/邮箱)。
*   T1-07 (A2/A3/A4): 实现表单数据验证 (前端 + 后端 `/api/profiles` POST)。
*   T1-08 (A3): 开发 `/forgot-password` 页面 UI。
*   T1-09 (A3): 实现发送密码重置邮件逻辑。
*   T1-10 (A4): 开发 `/update-password` 页面 UI。
*   T1-11 (A4): 实现密码更新逻辑。
*   T1-12: 实现全局认证状态管理 (Context/ Zustand)。

**模块 B: 主应用 - 学习者视角 (Main App - Student)**
*   T2-01 (B1): 开发导航栏组件 (Logo, 用户信息, 学科筛选, 通知占位, 登出)。
*   T2-02 (B1): 实现学科筛选功能 (状态管理/URL更新)。
*   T2-03 (B2): 开发上传区域组件 (拖放区, 文件选择, 相机集成 - 可选, 预览缩略图, 学科选择器, 上传按钮)。
*   T2-04 (B2): 实现前端图片验证 (类型, 大小, 数量)。
*   T2-05 (B2): 实现图片预览功能。
*   T2-06 (B2): 实现调用 `POST /api/upload` 逻辑。
*   T2-07 (B2): 实现上传状态反馈 (加载中, 成功, 错误)。
*   T2-08 (FastAPI): 实现 `POST /upload` 端点 (图片接收, Storage上传, Nvidia MiniMax 3调用, 数据解析, DB存储, 复习计划生成)。
*   T2-09 (B3): 开发学习记录列表/时间线视图组件 (`ProblemCard`)。
*   T2-10 (B3): 实现分页加载逻辑 (调用 `GET /api/problems`)。
*   T2-11 (B3): 实现搜索/过滤逻辑 (按学科, 时间 - 集成到 `GET /api/problems` 查询)。
*   T2-12 (B3): 实现点击卡片跳转详情页 (`/problem/[id]`)。
*   T2-13 (B3): 实现删除题目功能 (弹窗确认 -> `DELETE /api/problems/[id]`)。
*   T2-14 (FastAPI): 实现 `GET /api/problems`, `GET /api/problems/{id}`, `DELETE /api/problems/{id}` 端点。
*   T2-15 (B4a): 集成日历组件 (e.g., `react-calendar`)。
*   T2-16 (B4a): 实现根据 `review_schedules` 数据在日历上标记复习日期。
*   T2-17 (B4a): 实现点击日期显示当天复习任务列表。
*   T2-18 (B4b): 开发复习任务列表视图组件 (`ReviewTaskCard` - 题目摘要, 日期, 状态, 操作按钮)。
*   T2-19 (B4b): 实现获取复习任务列表逻辑 (调用 `GET /api/reviews`)。
*   T2-20 (B4b): 实现标记复习状态功能 (调用 `PUT /api/reviews/[id]/status`)。
*   T2-21 (FastAPI): 实现 `GET /api/reviews`, `PUT /api/reviews/{id}/status` 端点 (包含艾宾浩斯计算逻辑)。
*   T2-22 (B5): 开发题目详情页 (`/problem/[id]`) UI (图片展示, 文本展示, 复习计划列表)。
*   T2-23 (B5): 实现加载题目详情数据逻辑 (调用 `GET /api/problems/[id]`)。

**模块 C: 家长视角 (Parent View)**
*   T3-01 (C1): 开发家长仪表盘入口 (`/parent-dashboard`)。
*   T3-02 (C1): 开发孩子选择器组件 (下拉/列表)。
*   T3-03 (C2): 开发学习概览组件 (统计卡片/图表 - 题目数/学科, 学习时间, 复习率)。
*   T3-04 (C2): 实现获取学习概览数据逻辑 (调用 `GET /api/parent/overview`)。
*   T3-05 (FastAPI): 实现 `GET /api/parent/overview` 端点 (聚合查询)。
*   T3-06 (C3): 复用/调整学习记录列表组件 (B3)，限定显示选定孩子的数据 (调用 `GET /api/problems?user_id=CHILD_ID`)。
*   T3-07 (C4): 复用/调整复习计划视图组件 (B4)，限定显示选定孩子的数据 (调用 `GET /api/reviews?user_id=CHILD_ID`)。
*   T3-08 (FastAPI): 在 `GET /api/problems` 和 `GET /api/reviews` 中增加家长权限验证逻辑 (检查请求的`user_id`是否是当前家长的孩子)。

**模块 D: 设置与其它 (Settings & Misc)**
*   T4-01 (D1): 开发设置页面框架 (`/settings`)。
*   T4-02 (D1): 开发个人资料设置表单 (姓名, 头像上传, 密码修改)。
*   T4-03 (D1): 实现头像上传逻辑 (Supabase Storage)。
*   T4-04 (D1): 实现更新个人信息逻辑 (调用 `PATCH /api/profiles`)。
*   T4-05 (D1): 实现修改密码逻辑 (Supabase Auth)。
*   T4-06 (D2): 开发孩子管理界面 (添加 - 输入孩子邮箱/ID, 移除 - 已关联孩子列表)。
*   T4-07 (D2): 实现添加孩子逻辑 (调用 `POST /api/parent/child`)。
*   T4-08 (D2): 实现移除孩子逻辑 (调用 `DELETE /api/parent/child/{child_id}`)。
*   T4-09 (FastAPI): 实现 `PATCH /api/profiles`, `POST /api/parent/child`, `DELETE /api/parent/child/{child_id}` 端点。
*   T4-10: 实现全局错误边界处理。
*   T4-11: 实现加载状态指示器。
*   T4-12: 实现响应式布局适配。

**模块 E: 部署与监控 (Deployment & Monitoring)**
*   T5-01: 部署 Next.js 前端到 Vercel。
*   T5-02: 部署 FastAPI 后端到支持 Python 的云服务 (Render, Fly.io, AWS ECS/EB 等)。
*   T5-03: 配置生产环境变量。
*   T5-04: 配置域名与 SSL。
*   T5-05: 实现简单的日志记录 (FastAPI, Next.js API Routes)。
*   T5-06: (可选) 集成错误监控服务 (Sentry, Rollbar)。

**关键注意事项与优化点:**

1.  **Nvidia MiniMax 3 Prompt 设计:** 这是成功的关键。Prompt 必须明确指示模型识别题目、分步解题思路、最终答案，并尝试估算学习时间。可能需要针对不同学科微调Prompt。**投入大量时间测试和优化。**
2.  **AI 解析容错:** Nvidia MiniMax 3 可能返回不完整、错误或无法解析的结果。后端必须有健壮的处理逻辑：存储原始响应、尝试提取关键字段、定义清晰的失败状态、记录错误日志 (`ai_error_logs`)、给用户友好的反馈 (如“解析失败，请尝试上传更清晰的图片或手动输入”)。
3.  **图片处理:** 考虑在上传前或后端进行图片压缩/优化 (e.g., using `Pillow` in FastAPI) 以节省存储和带宽。
4.  **异步任务:** `POST /upload` 中的 AI 调用和复杂处理应放在后台任务 (Celery, RQ, FastAPI `BackgroundTasks`) 中，避免阻塞 HTTP 响应。立即返回“处理中”状态，前端通过轮询或WebSocket获取最终结果。
5.  **权限校验:** **至关重要！** 在所有涉及用户数据的 API 端点 (FastAPI & Next.js API Routes) 中，严格校验 JWT，确保用户只能访问和操作自己的 (或其孩子的) 数据。使用 `supabase-js` 或 `supabase-py` 的 `getUser` 功能。
6.  **数据验证:** 使用 Zod (Next.js) 和 Pydantic (FastAPI) 在 **每一层** (前端表单、Next.js API Route 输入、FastAPI 端点输入/输出、数据库模型) 进行严格验证。
7.  **艾宾浩斯间隔:** 将间隔天数配置化 (数据库表或配置文件)，便于后续调整。考虑根据题目难度 (如果收集了难度反馈 `review_records.difficulty_rating`) 动态调整间隔。
8.  **复习通知:** 实现邮件或应用内通知提醒用户复习 (e.g., 查询 `review_schedules` 中 `scheduled_date = tomorrow` 且 `completed = false` 的任务)。
9.  **性能优化:**
    *   数据库索引 (`user_id`, `subject_id`, `scheduled_date`, `problem_id`, `parent_id`, `child_id`)。
    *   对列表查询 (`/problems`, `/reviews`) 使用高效分页 (Keyset Pagination 优于 OFFSET/LIMIT)。
    *   缓存常用数据 (如学科列表 `subjects`)。
    *   优化图片加载 (使用 Supabase Storage 的图片转换功能生成缩略图)。
10. **测试:** 编写单元测试 (Jest/Vitest for FE, Pytest for BE) 和集成测试 (Cypress/Playwright for E2E)，覆盖核心流程 (上传、解析、复习状态更新、权限校验)。

这个设计提供了一个高度结构化、模块化、符合软件工程实践的开发蓝图。它明确了每个画面的功能、交互事件、调用的API以及前后端的分工。任务列表 (Txx) 可以直接用于项目管理工具 (如 Jira, Trello) 进行任务分配和跟踪。请务必在开始编码前仔细审查数据库设计和 API 契约。祝你开发顺利！
