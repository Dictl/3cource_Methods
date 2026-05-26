-- =====================================================
-- Auth Extension for Existing Database
-- Adds role-based access control without modifying existing schema
-- =====================================================

-- 1. Create user_role enum type (if not exists)
DO $$ 
BEGIN
    CREATE TYPE user_role_enum AS ENUM ('admin', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- 2. Add role column to auth_user table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'auth_user' AND column_name = 'role'
    ) THEN
        ALTER TABLE auth_user ADD COLUMN role user_role_enum DEFAULT 'viewer';
    END IF;
END
$$;

-- 3. Create admin group if it doesn't exist
INSERT INTO auth_group (name)
SELECT 'Admins'
WHERE NOT EXISTS (SELECT 1 FROM auth_group WHERE name = 'Admins');

-- 4. Create viewer group if it doesn't exist
INSERT INTO auth_group (name)
SELECT 'Viewers'
WHERE NOT EXISTS (SELECT 1 FROM auth_group WHERE name = 'Viewers');

-- 5. Create admin user
-- Password: admin123 (will be hashed by Django)
INSERT INTO auth_user (
    password, 
    last_login, 
    is_superuser, 
    username, 
    first_name, 
    last_name, 
    email, 
    is_staff, 
    is_active, 
    date_joined,
    role
)
SELECT 
    'pbkdf2_sha256$870000$abcdefghijklmnopqrst$1234567890abcdefghijklmnopqrstuvwxyz1234=',
    NULL,
    true,
    'admin',
    'Admin',
    'User',
    'admin@example.com',
    true,
    true,
    NOW(),
    'admin'::user_role_enum
WHERE NOT EXISTS (SELECT 1 FROM auth_user WHERE username = 'admin');

-- 6. Create viewer user
-- Password: viewer123 (will be hashed by Django)
INSERT INTO auth_user (
    password, 
    last_login, 
    is_superuser, 
    username, 
    first_name, 
    last_name, 
    email, 
    is_staff, 
    is_active, 
    date_joined,
    role
)
SELECT 
    'pbkdf2_sha256$870000$lmnopqrstuvwxyzzzzz$abcdefghijklmnopqrstuvwxyz1234567890abcd=',
    NULL,
    false,
    'viewer',
    'Viewer',
    'User',
    'viewer@example.com',
    false,
    true,
    NOW(),
    'viewer'::user_role_enum
WHERE NOT EXISTS (SELECT 1 FROM auth_user WHERE username = 'viewer');

-- 7. Add admins to admin group
INSERT INTO auth_user_groups (user_id, group_id)
SELECT u.id, g.id FROM auth_user u, auth_group g 
WHERE u.username = 'admin' AND g.name = 'Admins'
AND NOT EXISTS (
    SELECT 1 FROM auth_user_groups 
    WHERE user_id = u.id AND group_id = g.id
);

-- 8. Add viewer to viewer group
INSERT INTO auth_user_groups (user_id, group_id)
SELECT u.id, g.id FROM auth_user u, auth_group g 
WHERE u.username = 'viewer' AND g.name = 'Viewers'
AND NOT EXISTS (
    SELECT 1 FROM auth_user_groups 
    WHERE user_id = u.id AND group_id = g.id
);

-- =====================================================
-- NOTE: Passwords are placeholders and MUST be set via Django
-- Use: python manage.py shell
-- >>> from django.contrib.auth.models import User
-- >>> u = User.objects.get(username='admin')
-- >>> u.set_password('admin123')
-- >>> u.save()
-- >>> 
-- >>> u = User.objects.get(username='viewer')
-- >>> u.set_password('viewer123')
-- >>> u.save()
-- =====================================================
