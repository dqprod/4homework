-- 写入用户资料 + 家长孩子关联
-- 创建时间: 2026-06-17

-- 先清除旧的失败 profile 记录（trigger 之前可能插入了错误的空行）
DELETE FROM public.parent_child WHERE child_id IN (
  'afb94c66-47c2-4a15-881c-37c6a70fbef6',
  'a0c0ed91-e4fb-4b0b-a566-e2c40327c146',
  '3064f2b8-fb31-49b9-bc95-af2825496739',
  '2ae19dcd-5b87-4b99-b432-868396313620'
);
DELETE FROM public.parent_child WHERE parent_id = '3064f2b8-fb31-49b9-bc95-af2825496739';

DELETE FROM public.profiles WHERE id IN (
  'afb94c66-47c2-4a15-881c-37c6a70fbef6',
  'a0c0ed91-e4fb-4b0b-a566-e2c40327c146',
  '3064f2b8-fb31-49b9-bc95-af2825496739',
  '2ae19dcd-5b87-4b99-b432-868396313620'
);

-- 写入正确的 profiles
INSERT INTO public.profiles (id, full_name, role, username, created_at) VALUES
  ('3064f2b8-fb31-49b9-bc95-af2825496739', 'お父さん',      'parent',  'parent',  now()),
  ('afb94c66-47c2-4a15-881c-37c6a70fbef6', '花子 (小4)',    'student', 'hanako',  now()),
  ('2ae19dcd-5b87-4b99-b432-868396313620', '太郎 (小3)',    'student', 'taro',    now()),
  ('a0c0ed91-e4fb-4b0b-a566-e2c40327c146', '次郎 (小2)',    'student', 'jiro',    now());

-- 家长关联孩子（お父さん→花子、太郎、次郎）
INSERT INTO public.parent_child (parent_id, child_id, created_at) VALUES
  ('3064f2b8-fb31-49b9-bc95-af2825496739', 'afb94c66-47c2-4a15-881c-37c6a70fbef6', now()),
  ('3064f2b8-fb31-49b9-bc95-af2825496739', '2ae19dcd-5b87-4b99-b432-868396313620', now()),
  ('3064f2b8-fb31-49b9-bc95-af2825496739', 'a0c0ed91-e4fb-4b0b-a566-e2c40327c146', now());

-- 验证
SELECT '✅ 用户列表' AS info, full_name, role, id FROM profiles
WHERE id IN ('3064f2b8-fb31-49b9-bc95-af2825496739','afb94c66-47c2-4a15-881c-37c6a70fbef6','2ae19dcd-5b87-4b99-b432-868396313620','a0c0ed91-e4fb-4b0b-a566-e2c40327c146');

SELECT '✅ 家长-孩子关联数' AS info, COUNT(*) AS count FROM parent_child
WHERE parent_id = '3064f2b8-fb31-49b9-bc95-af2825496739';
