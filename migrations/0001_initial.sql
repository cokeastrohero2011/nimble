PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  training_mode TEXT NOT NULL CHECK (training_mode IN ('focused', 'mixed')),
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms = 600000),
  slow_threshold_ms INTEGER NOT NULL DEFAULT 5000 CHECK (slow_threshold_ms BETWEEN 1000 AND 30000),
  total_questions INTEGER NOT NULL CHECK (total_questions >= 0),
  correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
  incorrect_count INTEGER NOT NULL CHECK (incorrect_count >= 0),
  slow_count INTEGER NOT NULL CHECK (slow_count >= 0),
  average_response_time_ms REAL NOT NULL CHECK (average_response_time_ms >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  drill_type TEXT NOT NULL CHECK (drill_type IN ('addition', 'multiplication', 'subtraction', 'bonds10', 'bonds100')),
  question_text TEXT NOT NULL,
  operands_json TEXT NOT NULL,
  correct_answer INTEGER NOT NULL,
  submitted_answer INTEGER NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  response_time_ms REAL NOT NULL CHECK (response_time_ms >= 0),
  is_slow INTEGER NOT NULL CHECK (is_slow IN (0, 1)),
  answered_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON sessions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_session_id ON responses(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_session_drill ON responses(session_id, drill_type);
PRAGMA optimize;
