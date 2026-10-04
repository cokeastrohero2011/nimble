import { env } from 'cloudflare:workers';
import { answersEqual } from './answer-attempts';
import { normalizeDecimal } from './decimal';
import { reconstructQuestion } from './questions';
import { calculateReport, isSlowResponse } from './report';
import {
  CORE_DRILLS,
  DRILL_TYPES,
  type DrillType,
  type HistoricalResponse,
  type HistoryItem,
  type Operands,
  type QuestionMetadata,
  type ResponseRecord,
  type SessionPayload,
  type TrainingMode,
} from './nimble-types';

type InputRecord = Partial<ResponseRecord> & { operands?: unknown };
type SessionRow = {
  id: string;
  training_mode: TrainingMode;
  enabled_drills_json: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  slow_threshold_ms: number;
  total_questions: number;
  correct_count: number;
  incorrect_count: number;
  slow_count: number;
  average_response_time_ms: number;
};
type ResponseRow = {
  id: string;
  session_id?: string;
  drill_type: DrillType;
  question_text: string;
  operands_json: string;
  correct_answer: number;
  correct_answer_text: string;
  submitted_answer: number;
  submitted_answer_text: string;
  metadata_json: string;
  is_correct: number;
  response_time_ms: number;
  is_slow: number;
  answered_at: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const isUuidLike = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 8 && value.length <= 80;
const isTrainingMode = (value: unknown): value is TrainingMode =>
  value === 'focused' ||
  value === 'mixed' ||
  value === 'custom' ||
  value === 'free';
const isDrill = (value: unknown): value is DrillType =>
  typeof value === 'string' &&
  (DRILL_TYPES as readonly string[]).includes(value);
const isInteger = (value: unknown): value is number => Number.isInteger(value);

function parseEnabled(value: string | null | undefined): DrillType[] {
  try {
    const parsed = JSON.parse(value ?? '[]') as unknown[];
    const valid = parsed.filter(isDrill);
    return valid.length ? [...new Set(valid)] : [...CORE_DRILLS];
  } catch {
    return [...CORE_DRILLS];
  }
}

function parseMetadata(
  value: string | undefined,
): QuestionMetadata | undefined {
  try {
    const parsed = JSON.parse(value ?? '{}') as QuestionMetadata;
    return Array.isArray(parsed.strategyTags) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function validateOperands(drill: DrillType, value: unknown): Operands | null {
  if (!isObject(value)) return null;
  const { a, b, missingSide, decimalValue, factor } = value;
  if (
    typeof a !== 'number' ||
    !Number.isFinite(a) ||
    typeof b !== 'number' ||
    !Number.isFinite(b)
  )
    return null;
  if (
    missingSide !== undefined &&
    missingSide !== 'left' &&
    missingSide !== 'right'
  )
    return null;
  if (drill === 'addition' || drill === 'multiplication') {
    return isInteger(a) && isInteger(b) && a >= 2 && a <= 9 && b >= 2 && b <= 9
      ? { a, b }
      : null;
  }
  if (drill === 'subtraction') {
    return isInteger(a) && isInteger(b) && a >= 2 && a <= 9 && b >= 2 && b <= a
      ? { a, b }
      : null;
  }
  if (drill === 'bonds10' || drill === 'bonds100') {
    const total = drill === 'bonds10' ? 10 : 100;
    const max = drill === 'bonds10' ? 8 : 98;
    return isInteger(a) &&
      isInteger(b) &&
      a >= 2 &&
      a <= max &&
      b === total - a &&
      (missingSide === 'left' || missingSide === 'right')
      ? { a, b, missingSide }
      : null;
  }
  const normalized =
    typeof decimalValue === 'string' ? normalizeDecimal(decimalValue) : null;
  if (
    !normalized ||
    normalized === '1' ||
    !isInteger(factor) ||
    ![10, 100, 1000].includes(factor) ||
    b !== factor ||
    a !== Number(normalized)
  )
    return null;
  return { a, b, decimalValue: normalized, factor: factor as 10 | 100 | 1000 };
}

function validateResponse(
  input: InputRecord,
  thresholdMs: number,
): ResponseRecord | null {
  if (!isUuidLike(input.id) || !isDrill(input.drillType)) return null;
  const operands = validateOperands(input.drillType, input.operands);
  if (!operands) return null;
  const expected = reconstructQuestion(input.drillType, operands);
  const submittedText =
    typeof input.submittedAnswerText === 'string'
      ? normalizeDecimal(input.submittedAnswerText)
      : typeof input.submittedAnswer === 'number' &&
          Number.isFinite(input.submittedAnswer)
        ? normalizeDecimal(String(input.submittedAnswer))
        : null;
  if (
    !submittedText ||
    submittedText.length > 32 ||
    input.questionText !== expected.questionText
  )
    return null;
  if (
    input.correctAnswerText !== undefined &&
    !answersEqual(input.correctAnswerText, expected.correctAnswerText)
  )
    return null;
  if (
    input.correctAnswer !== undefined &&
    !answersEqual(input.correctAnswer, expected.correctAnswerText)
  )
    return null;
  if (
    typeof input.responseTimeMs !== 'number' ||
    !Number.isFinite(input.responseTimeMs) ||
    input.responseTimeMs < 0 ||
    input.responseTimeMs > 600_000
  )
    return null;
  if (!isIsoDate(input.answeredAt)) return null;
  const responseTimeMs = Math.round(input.responseTimeMs * 10) / 10;
  const correct = answersEqual(submittedText, expected.correctAnswerText);
  return {
    id: input.id,
    drillType: input.drillType,
    questionText: expected.questionText,
    operands,
    correctAnswer: expected.correctAnswer,
    correctAnswerText: expected.correctAnswerText,
    submittedAnswer: Number(submittedText),
    submittedAnswerText: submittedText,
    metadata: expected.metadata,
    isCorrect: correct,
    responseTimeMs,
    isSlow: isSlowResponse(responseTimeMs, thresholdMs),
    answeredAt: input.answeredAt,
  };
}

export function validateSessionPayload(input: unknown): SessionPayload | null {
  if (
    !isObject(input) ||
    !isUuidLike(input.id) ||
    !isTrainingMode(input.trainingMode)
  )
    return null;
  if (!Array.isArray(input.enabledDrills)) return null;
  const enabledDrills = input.enabledDrills.filter(isDrill);
  if (
    !enabledDrills.length ||
    enabledDrills.length !== input.enabledDrills.length ||
    new Set(enabledDrills).size !== enabledDrills.length
  )
    return null;
  if (
    !isIsoDate(input.startedAt) ||
    !isIsoDate(input.completedAt) ||
    !isInteger(input.durationMs) ||
    input.durationMs < 0 ||
    (input.trainingMode !== 'free' && input.durationMs !== 600_000)
  )
    return null;
  if (
    !isInteger(input.slowThresholdMs) ||
    input.slowThresholdMs < 1000 ||
    input.slowThresholdMs > 30_000
  )
    return null;
  if (!Array.isArray(input.responses) || input.responses.length > 10_000)
    return null;
  const started = Date.parse(input.startedAt);
  const completed = Date.parse(input.completedAt);
  if (completed < started) return null;
  if (input.trainingMode !== 'free' && completed - started < 590_000)
    return null;
  const responses = input.responses.map((row) =>
    validateResponse(row as InputRecord, input.slowThresholdMs as number),
  );
  if (
    responses.some((row) => row === null) ||
    responses.some((row) => row && !enabledDrills.includes(row.drillType))
  )
    return null;
  return {
    id: input.id,
    trainingMode: input.trainingMode,
    enabledDrills,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    slowThresholdMs: input.slowThresholdMs,
    responses: responses as ResponseRecord[],
  };
}

export async function insertSession(session: SessionPayload) {
  const report = calculateReport(session);
  const db = env.DB;
  const statements = [
    db
      .prepare(`INSERT INTO sessions
      (id, training_mode, enabled_drills_json, started_at, completed_at, duration_ms, slow_threshold_ms,
       total_questions, correct_count, incorrect_count, slow_count, average_response_time_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        session.id,
        session.trainingMode,
        JSON.stringify(session.enabledDrills),
        session.startedAt,
        session.completedAt,
        session.durationMs,
        session.slowThresholdMs,
        report.totalQuestions,
        report.correctCount,
        report.incorrectCount,
        report.slowCount,
        report.averageResponseTimeMs,
        new Date().toISOString(),
      ),
    ...session.responses.map((response) =>
      db
        .prepare(`INSERT INTO responses
      (id, session_id, drill_type, question_text, operands_json, correct_answer, correct_answer_text,
       submitted_answer, submitted_answer_text, metadata_json, is_correct, response_time_ms, is_slow, answered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          response.id,
          session.id,
          response.drillType,
          response.questionText,
          JSON.stringify(response.operands),
          response.correctAnswer,
          response.correctAnswerText ?? String(response.correctAnswer),
          response.submittedAnswer,
          response.submittedAnswerText ?? String(response.submittedAnswer),
          JSON.stringify(response.metadata ?? {}),
          response.isCorrect ? 1 : 0,
          response.responseTimeMs,
          response.isSlow ? 1 : 0,
          response.answeredAt,
        ),
    ),
  ];
  await db.batch(statements);
  return calculateReport(session, await getHistoricalResponses(session.id));
}

export async function listSessions(): Promise<HistoryItem[]> {
  const result =
    await env.DB.prepare(`SELECT id, training_mode, enabled_drills_json, started_at, completed_at,
    duration_ms, total_questions, correct_count, incorrect_count, slow_count, average_response_time_ms
    FROM sessions ORDER BY completed_at DESC LIMIT 100`).all<SessionRow>();
  return result.results.map((row) => ({
    id: row.id,
    trainingMode: row.training_mode,
    enabledDrills: parseEnabled(row.enabled_drills_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    totalQuestions: row.total_questions,
    correctCount: row.correct_count,
    incorrectCount: row.incorrect_count,
    slowCount: row.slow_count,
    accuracy: row.total_questions
      ? (row.correct_count / row.total_questions) * 100
      : 0,
    averageResponseTimeMs: row.average_response_time_ms,
  }));
}

const mapResponse = (row: ResponseRow): ResponseRecord => ({
  id: row.id,
  drillType: row.drill_type,
  questionText: row.question_text,
  operands: JSON.parse(row.operands_json) as Operands,
  correctAnswer: row.correct_answer,
  correctAnswerText: row.correct_answer_text || String(row.correct_answer),
  submittedAnswer: row.submitted_answer,
  submittedAnswerText:
    row.submitted_answer_text || String(row.submitted_answer),
  metadata: parseMetadata(row.metadata_json),
  isCorrect: Boolean(row.is_correct),
  responseTimeMs: row.response_time_ms,
  isSlow: Boolean(row.is_slow),
  answeredAt: row.answered_at,
});

export async function getSession(id: string): Promise<SessionPayload | null> {
  const db = env.DB;
  const session = await db
    .prepare(`SELECT id, training_mode, enabled_drills_json, started_at, completed_at,
    duration_ms, slow_threshold_ms, total_questions, correct_count, incorrect_count, slow_count, average_response_time_ms
    FROM sessions WHERE id = ?`)
    .bind(id)
    .first<SessionRow>();
  if (!session) return null;
  const rows = await db
    .prepare(`SELECT id, drill_type, question_text, operands_json, correct_answer,
    correct_answer_text, submitted_answer, submitted_answer_text, metadata_json, is_correct,
    response_time_ms, is_slow, answered_at FROM responses WHERE session_id = ? ORDER BY answered_at ASC`)
    .bind(id)
    .all<ResponseRow>();
  return {
    id: session.id,
    trainingMode: session.training_mode,
    enabledDrills: parseEnabled(session.enabled_drills_json),
    startedAt: session.started_at,
    completedAt: session.completed_at,
    durationMs: session.duration_ms,
    slowThresholdMs: session.slow_threshold_ms,
    responses: rows.results.map(mapResponse),
  };
}

export async function getHistoricalResponses(
  excludeSessionId: string,
): Promise<HistoricalResponse[]> {
  const result =
    await env.DB.prepare(`SELECT id, session_id, drill_type, question_text, operands_json,
    correct_answer, correct_answer_text, submitted_answer, submitted_answer_text, metadata_json,
    is_correct, response_time_ms, is_slow, answered_at FROM responses
    WHERE session_id <> ? ORDER BY answered_at DESC LIMIT 500`)
      .bind(excludeSessionId)
      .all<ResponseRow>();
  return result.results.map((row) => ({
    ...mapResponse(row),
    sessionId: row.session_id ?? '',
  }));
}
