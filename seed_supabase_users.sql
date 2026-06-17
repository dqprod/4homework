-- =====================================================
-- 4homework Supabase Fix + Seed Script
-- Run this in Supabase Studio → SQL Editor
-- =====================================================

-- STEP 1: Fix the auth trigger to match our profiles schema
-- (GoTrue fires this after user creation, was inserting wrong columns)
CREATE OR REPLACE FUNCTION auth.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auth.handle_new_user();

-- STEP 2: Create test users in auth.users (trigger will auto-create profiles)
-- Password: Home_work32! (bcrypt hash)
DO $$
DECLARE
  pwd_hash text := '$2b$10$wi12KT6wyRgwqlgHTf1fOeBZiu3ijYXb.wpDcvyPXO9bSpvCEzxgi';
  uid uuid;
  email text;
  uname text;
  urole text;
  u_emails text[] := ARRAY['parent@homework.jp', 'hanako@homework.jp', 'taro@homework.jp', 'jiro@homework.jp'];
  u_names text[] := ARRAY['お父さん', '花子 (小4)', '太郎 (小3)', '次郎 (小2)'];
  u_roles text[] := ARRAY['parent', 'student', 'student', 'student'];
  u_ids uuid[] := ARRAY[
    '00000001-0001-0001-0001-000000000001',
    '00000002-0002-0002-0002-000000000002',
    '00000003-0003-0003-0003-000000000003',
    '00000004-0004-0004-0004-000000000004'
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(u_emails, 1) LOOP
    uid := u_ids[i];
    email := u_emails[i];
    uname := u_names[i];
    urole := u_roles[i];

    -- Delete stale profile if exists (from failed trigger runs)
    DELETE FROM public.profiles WHERE id = uid;

    INSERT INTO auth.users (id, instance_id, email, encrypted_password,
      email_confirmed_at, confirmation_sent_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, aud, role, is_sso_user, deleted_at)
    VALUES (uid, '00000000-0000-0000-0000-000000000000', email, pwd_hash,
      now(), now(),
      '{"provider":"email"}'::jsonb,
      jsonb_build_object('full_name', uname, 'role', urole),
      now(), now(), 'authenticated', 'authenticated',
      false, null)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

    -- Ensure profile exists (trigger should have done this, but be safe)
    INSERT INTO public.profiles (id, full_name, role, username, created_at)
    VALUES (uid, uname, urole, split_part(email, '@', 1), now())
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;
  END LOOP;

  -- Link parent → children
  INSERT INTO public.parent_child (parent_id, child_id, created_at)
  VALUES
    (u_ids[1], u_ids[2], now()),
    (u_ids[1], u_ids[3], now()),
    (u_ids[1], u_ids[4], now())
  ON CONFLICT DO NOTHING;
END $$;

-- STEP 3: Verify
SELECT '✅ Profiles' as section, full_name, role FROM profiles 
WHERE id IN (
  '00000001-0001-0001-0001-000000000001',
  '00000002-0002-0002-0002-000000000002',
  '00000003-0003-0003-0003-000000000003',
  '00000004-0004-0004-0004-000000000004'
);

SELECT '✅ Parent-child links' as section, count(*) as count FROM parent_child 
WHERE parent_id = '00000001-0001-0001-0001-000000000001';
