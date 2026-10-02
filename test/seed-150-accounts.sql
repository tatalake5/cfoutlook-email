-- Local test seed: 150 accounts + a tag spanning both id chunks.
-- Reproduces the D1 "too many SQL variables" scenario (>100 accounts).
-- Usage: pnpm exec wrangler d1 execute outlook-email-db --local --file test/seed-150-accounts.sql
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 150
)
INSERT OR IGNORE INTO accounts (email, password, client_id, refresh_token, group_id)
SELECT 'user' || n || '@test.com', 'pw' || n, 'client-' || n, 'rt-' || n, 1 FROM seq;

INSERT OR IGNORE INTO tags (id, name, color) VALUES (1, 'vip', '#ff0000');

-- Assignments on both sides of the 100-id chunk boundary
INSERT OR IGNORE INTO account_tags (account_id, tag_id)
SELECT id, 1 FROM accounts WHERE id IN (5, 100, 101, 145);
