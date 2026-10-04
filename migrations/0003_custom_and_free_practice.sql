PRAGMA foreign_keys = OFF;

CREATE TABLE sessions_v3 (
  id TEXT PRIMARY KEY NOT NULL,
  training_mode TEXT NOT NULL CHECK (training_mode IN ('focused', 'mixed', 'custom', 'free')),
  enabled_drills_json TEXT NOT NULL DEFAULT '["addition","multiplication","subtraction","bonds10","bonds100"]',
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  slow_threshold_ms INTEGER NOT NULL DEFAULT 5000 CHECK (slow_threshold_ms BETWEEN 1000 AND 30000),
  total_questions INTEGER NOT NULL CHECK (total_questions >= 0),
  correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
  incorrect_count INTEGER NOT NULL CHECK (incorrect_count >= 0),
  slow_count INTEGER NOT NULL CHECK (slow_count >= 0),
  average_response_time_ms REAL NOT NULL CHECK (average_response_time_ms >= 0),
  created_at TEXT NOT NULL
);

INSERT INTO sessions_v3 (
  id, training_mode, enabled_drills_json, started_at, completed_at, duration_ms,
  slow_threshold_ms, total_questions, correct_count, incorrect_count, slow_count,
  average_response_time_ms, created_at
)
SELECT id, training_mode, enabled_drills_json, started_at, completed_at, duration_ms,
  slow_threshold_ms, total_questions, correct_count, incorrect_count, slow_count,
  average_response_time_ms, created_at
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_v3 RENAME TO sessions;
CREATE INDEX idx_sessions_completed_at ON sessions(completed_at DESC);

PRAGMA foreign_keys = ON;
PRAGMA optimize;
