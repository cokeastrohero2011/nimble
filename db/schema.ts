import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    trainingMode: text('training_mode', {
      enum: ['focused', 'mixed', 'custom', 'free'],
    }).notNull(),
    enabledDrillsJson: text('enabled_drills_json')
      .notNull()
      .default(
        '["addition","multiplication","subtraction","bonds10","bonds100"]',
      ),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at').notNull(),
    durationMs: integer('duration_ms').notNull(),
    slowThresholdMs: integer('slow_threshold_ms').notNull().default(5000),
    totalQuestions: integer('total_questions').notNull(),
    correctCount: integer('correct_count').notNull(),
    incorrectCount: integer('incorrect_count').notNull(),
    slowCount: integer('slow_count').notNull(),
    averageResponseTimeMs: real('average_response_time_ms').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_sessions_completed_at').on(table.completedAt)],
);

export const responses = sqliteTable(
  'responses',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    drillType: text('drill_type').notNull(),
    questionText: text('question_text').notNull(),
    operandsJson: text('operands_json').notNull(),
    correctAnswer: real('correct_answer').notNull(),
    correctAnswerText: text('correct_answer_text').notNull(),
    submittedAnswer: real('submitted_answer').notNull(),
    submittedAnswerText: text('submitted_answer_text').notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    isCorrect: integer('is_correct', { mode: 'boolean' }).notNull(),
    responseTimeMs: real('response_time_ms').notNull(),
    isSlow: integer('is_slow', { mode: 'boolean' }).notNull(),
    answeredAt: text('answered_at').notNull(),
  },
  (table) => [
    index('idx_responses_session_id').on(table.sessionId),
    index('idx_responses_session_drill').on(table.sessionId, table.drillType),
  ],
);
