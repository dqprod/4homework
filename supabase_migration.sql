-- Supabase SQL migration script for 4homework
-- Run this in Supabase Studio → SQL Editor

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto" with schema extensions;

-- Profiles (extends auth.users)
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text,
    full_name text,
    role text not null check (role in ('student', 'parent')),
    avatar_url text,
    created_at timestamptz not null default now()
);

-- Subjects
create table if not exists public.subjects (
    id serial primary key,
    name text not null unique,
    icon text
);

-- Seed subjects
insert into public.subjects (id, name, icon) values
    (1, '算数', '🔢'),
    (2, '国语', '📖'),
    (3, '理科', '🔬'),
    (4, '社会', '🌏'),
    (5, '英语', '🅰️')
on conflict (id) do nothing;

-- Problems
create table if not exists public.problems (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    subject_id int not null references public.subjects(id) on delete restrict,
    original_image_url text not null,
    problem_text text not null,
    solution_steps text,
    final_answer text,
    estimated_study_time int,
    memo text,
    ai_response_raw jsonb,
    created_at timestamptz not null default now()
);

-- Review schedules (Ebbinghaus)
create table if not exists public.review_schedules (
    id uuid primary key default gen_random_uuid(),
    problem_id uuid not null references public.problems(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    review_stage int not null default 0,
    scheduled_date date not null,
    completed boolean not null default false,
    completed_at timestamptz,
    next_review_interval int,
    created_at timestamptz not null default now(),
    updated_at timestamptz
);

-- Review records (detailed tracking)
create table if not exists public.review_records (
    id uuid primary key default gen_random_uuid(),
    review_schedule_id uuid not null references public.review_schedules(id) on delete cascade,
    problem_id uuid not null references public.problems(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    reviewed_at timestamptz not null default now(),
    difficulty_rating int check (difficulty_rating between 1 and 5),
    notes text
);

-- Parent-child relationships
create table if not exists public.parent_child (
    parent_id uuid not null references public.profiles(id) on delete cascade,
    child_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (parent_id, child_id)
);

-- Manual reviews (user-added extra review dates)
create table if not exists public.manual_reviews (
    id uuid primary key default gen_random_uuid(),
    problem_id uuid not null references public.problems(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    scheduled_date date not null,
    note text,
    completed boolean not null default false,
    completed_at timestamptz,
    created_at timestamptz not null default now()
);

-- AI error logs
create table if not exists public.ai_error_logs (
    id serial primary key,
    user_id uuid references public.profiles(id) on delete set null,
    image_url text,
    request_payload jsonb,
    response_payload jsonb,
    error_message text,
    occurred_at timestamptz not null default now()
);

-- Indexes
create index if not exists ix_problems_user_id on public.problems(user_id);
create index if not exists ix_problems_subject_id on public.problems(subject_id);
create index if not exists ix_problems_created_at on public.problems(created_at);
create index if not exists ix_review_schedules_user_id on public.review_schedules(user_id);
create index if not exists ix_review_schedules_scheduled_date on public.review_schedules(scheduled_date);
create index if not exists ix_review_schedules_problem_id on public.review_schedules(problem_id);
create index if not exists ix_review_schedules_user_scheduled on public.review_schedules(user_id, scheduled_date);
create index if not exists ix_manual_reviews_user_id on public.manual_reviews(user_id);
create index if not exists ix_manual_reviews_scheduled_date on public.manual_reviews(scheduled_date);
create index if not exists ix_manual_reviews_problem_id on public.manual_reviews(problem_id);

-- RLS policies
alter table public.profiles enable row level security;
alter table public.problems enable row level security;
alter table public.review_schedules enable row level security;
alter table public.review_records enable row level security;
alter table public.parent_child enable row level security;
alter table public.manual_reviews enable row level security;
alter table public.ai_error_logs enable row level security;

-- Allow users to read own data
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);

-- Problems: owner + parents who are linked to the child
create policy "Owner can manage problems" on public.problems for all using (auth.uid() = user_id);
create policy "Parent can read child problems" on public.problems for select using (
    exists (select 1 from public.parent_child where parent_id = auth.uid() and child_id = user_id)
);

-- Review schedules: owner + parents
create policy "Owner can manage reviews" on public.review_schedules for all using (auth.uid() = user_id);
create policy "Parent can read child reviews" on public.review_schedules for select using (
    exists (select 1 from public.parent_child where parent_id = auth.uid() and child_id = user_id)
);

-- Parent-child: only parents and their links
create policy "Parent can manage own links" on public.parent_child for all using (auth.uid() = parent_id);

-- Manual reviews: owner + parents
create policy "Owner can manage manual reviews" on public.manual_reviews for all using (auth.uid() = user_id);
create policy "Parent can read child manual reviews" on public.manual_reviews for select using (
    exists (select 1 from public.parent_child where parent_id = auth.uid() and child_id = user_id)
);

-- Subjects: public read
create policy "Public read subjects" on public.subjects for select using (true);