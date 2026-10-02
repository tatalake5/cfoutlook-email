-- push_state: per-account watermark for Telegram new-email push.
-- last_pushed_at holds the receivedDateTime (ISO string) of the newest email
-- already pushed, so each cron run only forwards strictly newer messages.
CREATE TABLE IF NOT EXISTS push_state (
  account_id     INTEGER PRIMARY KEY,
  last_pushed_at TEXT DEFAULT '',
  updated_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
