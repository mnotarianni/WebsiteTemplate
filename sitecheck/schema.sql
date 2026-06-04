-- RianniTech SiteCheck — database schema. Paste into the D1 Console and Execute.

CREATE TABLE IF NOT EXISTS sites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT,
  url        TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id    INTEGER,
  url        TEXT NOT NULL,
  score      REAL,
  grade      TEXT,
  results    TEXT,                  -- JSON: full report
  scanned_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scans_site ON scans(site_id, id);
