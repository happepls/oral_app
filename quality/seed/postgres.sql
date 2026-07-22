INSERT INTO users (id, username, email, nickname, native_language, target_language)
VALUES ('00000000-0000-4000-8000-000000000001', 'quality_user', 'quality@example.invalid', 'Quality User', 'zh', 'en')
ON CONFLICT (id) DO NOTHING;
