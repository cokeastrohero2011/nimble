import {
  DRILL_TYPES,
  type DrillStats,
  type HistoricalResponse,
  type Report,
  type ResponseRecord,
  type SessionPayload,
} from './nimble-types';
import { generateQuickTips, generateRecurringPatterns } from './tips';

export const isSlowResponse = (responseTimeMs: number, thresholdMs = 5000) =>
  responseTimeMs > thresholdMs;

export const classifyPracticeReason = (response: ResponseRecord) => {
  if (!response.isCorrect && response.isSlow) return 'Incorrect + Slow';
  if (!response.isCorrect) return 'Incorrect';
  if (response.isSlow) return 'Slow';
  return '';
};

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function calculateReport(
  session: SessionPayload,
  historical: HistoricalResponse[] = [],
): Report {
  const responses = session.responses;
  const correctCount = responses.filter(
    (response) => response.isCorrect,
  ).length;
  const drillStats: DrillStats[] = DRILL_TYPES.map((drillType) => {
    const rows = responses.filter(
      (response) => response.drillType === drillType,
    );
    const correct = rows.filter((response) => response.isCorrect).length;
    return {
      drillType,
      questions: rows.length,
      correct,
      incorrect: rows.length - correct,
      accuracy: rows.length ? (correct / rows.length) * 100 : 0,
      averageResponseTimeMs: average(
        rows.map((response) => response.responseTimeMs),
      ),
      medianResponseTimeMs: median(
        rows.map((response) => response.responseTimeMs),
      ),
      slow: rows.filter((response) => response.isSlow).length,
    };
  });
  return {
    session,
    totalQuestions: responses.length,
    correctCount,
    incorrectCount: responses.length - correctCount,
    accuracy: responses.length ? (correctCount / responses.length) * 100 : 0,
    averageResponseTimeMs: average(
      responses.map((response) => response.responseTimeMs),
    ),
    medianResponseTimeMs: median(
      responses.map((response) => response.responseTimeMs),
    ),
    slowCount: responses.filter((response) => response.isSlow).length,
    drillStats,
    needsPractice: responses.filter(
      (problem) => !problem.isCorrect || problem.isSlow,
    ),
    quickTips: generateQuickTips(responses),
    recurringPatterns: generateRecurringPatterns(historical),
  };
}
