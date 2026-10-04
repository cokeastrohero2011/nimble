PRAGMA foreign_keys = ON;

ALTER TABLE sessions ADD COLUMN enabled_drills_json TEXT NOT NULL
  DEFAULT '["addition","multiplication","subtraction","bonds10","bonds100"]';

CREATE TABLE responses_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  drill_type TEXT NOT NULL CHECK (drill_type IN (
    'addition', 'multiplication', 'subtraction', 'bonds10', 'bonds100',
    'decimalDivision', 'decimalMultiplication'
  )),
  question_text TEXT NOT NULL,
  operands_json TEXT NOT NULL,
  correct_answer REAL NOT NULL,
  correct_answer_text TEXT NOT NULL,
  submitted_answer REAL NOT NULL,
  submitted_answer_text TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  response_time_ms REAL NOT NULL CHECK (response_time_ms >= 0),
  is_slow INTEGER NOT NULL CHECK (is_slow IN (0, 1)),
  answered_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

INSERT INTO responses_v2 (
  id, session_id, drill_type, question_text, operands_json, correct_answer, correct_answer_text,
  submitted_answer, submitted_answer_text, metadata_json, is_correct, response_time_ms, is_slow, answered_at
)
SELECT id, session_id, drill_type, question_text, operands_json, correct_answer, CAST(correct_answer AS TEXT),
  submitted_answer, CAST(submitted_answer AS TEXT), '{}', is_correct, response_time_ms, is_slow, answered_at
FROM responses;

DROP TABLE responses;
ALTER TABLE responses_v2 RENAME TO responses;

CREATE INDEX idx_responses_session_id ON responses(session_id);
CREATE INDEX idx_responses_session_drill ON responses(session_id, drill_type);
PRAGMA optimize;
