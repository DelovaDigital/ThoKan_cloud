INSERT INTO roles (name, description)
VALUES
    ('admin', 'Platform administrator with full access'),
    ('employee', 'Standard business user')
ON CONFLICT (name) DO NOTHING;

INSERT INTO system_settings (key, value)
VALUES
    ('security', '{"require_2fa_for_admin": false, "max_upload_size_mb": 100}'::jsonb),
    ('storage', '{"driver": "local", "retention_days_deleted": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;
