-- 手机号验证码登录（登录-2）：users 表加 phone 唯一列
-- 幂等：可重复执行
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
