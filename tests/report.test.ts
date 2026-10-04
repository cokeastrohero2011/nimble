import { describe, expect, it } from 'vitest';
import {
  calculateReport,
  classifyPracticeReason,
  isSlowResponse,
} from '../lib/report';
import type {
  DrillType,
  ResponseRecord,
  SessionPayload,
} from '../lib/nimble-types';

function row(
  drillType: DrillType,
  answer: string,
  correct: string,
  ms: number,
  factor?: 10 | 100 | 1000,
): ResponseRecord {
  const decimal =
    drillType === 'decimalDivision' || drillType === 'decimalMultiplication';
  return {
    id: `response-${drillType}-${answer}-${ms}`,
    drillType,
    questionText: 'test',
    operands: decimal
      ? { a: 6.4, b: factor!, decimalValue: '6.4', factor }
      : { a: 2, b: Number(correct) },
    correctAnswer: Number(correct),
    correctAnswerText: correct,
    submittedAnswer: Number(answer),
    submittedAnswerText: answer,
    metadata: {
      strategyTags: decimal
        ? [
            `decimal-${drillType === 'decimalDivision' ? 'division' : 'multiplication'}`,
          ]
        : [],
      ...(decimal
        ? {
            decimalOperation:
              drillType === 'decimalDivision'
                ? ('division' as const)
                : ('multiplication' as const),
            decimalFactor: factor,
          }
        : {}),
    },
    isCorrect: answer === correct,
    responseTimeMs: ms,
    isSlow: isSlowResponse(ms),
    answeredAt: '2026-08-28T10:00:00.000Z',
  };
}
const session = (responses: ResponseRecord[]): SessionPayload => ({
  id: 'session-1234',
  trainingMode: 'mixed',
  enabledDrills: [...new Set(responses.map((item) => item.drillType))],
  startedAt: '2026-08-28T10:00:00.000Z',
  completedAt: '2026-08-28T10:10:00.000Z',
  durationMs: 600_000,
  slowThresholdMs: 5000,
  responses,
});

describe('reports and coaching', () => {
  it('uses strict greater-than slow classification and correct reasons', () => {
    expect(isSlowResponse(5000)).toBe(false);
    expect(isSlowResponse(5000.01)).toBe(true);
    expect(classifyPracticeReason(row('addition', '3', '4', 6200))).toBe(
      'Incorrect + Slow',
    );
  });
  it('calculates mixed drill-specific statistics from raw rows', () => {
    const report = calculateReport(
      session([
        row('addition', '4', '4', 1000),
        row('addition', '5', '4', 3000),
        row('decimalDivision', '0.64', '0.064', 6000, 100),
        row('decimalMultiplication', '640', '640', 2000, 100),
      ]),
    );
    expect(report.totalQuestions).toBe(4);
    expect(report.correctCount).toBe(2);
    expect(report.slowCount).toBe(1);
    expect(report.needsPractice).toHaveLength(2);
    expect(
      report.drillStats.find((item) => item.drillType === 'decimalDivision'),
    ).toMatchObject({ questions: 1, correct: 0 });
  });
  it('requires repeated evidence before showing a quick tip', () => {
    expect(
      calculateReport(
        session([row('decimalDivision', '0.64', '0.064', 2000, 100)]),
      ).quickTips,
    ).toEqual([]);
    const report = calculateReport(
      session([
        row('decimalDivision', '0.64', '0.064', 2000, 100),
        row('decimalDivision', '0.064', '0.064', 6500, 100),
      ]),
    );
    expect(report.quickTips[0]?.id).toBe('decimal-division-100');
  });
  it('requires three weak rows across two historical sessions for recurrence', () => {
    const current = session([row('addition', '4', '4', 1000)]);
    const historical = [
      {
        ...row('decimalDivision', '0.64', '0.064', 2000, 100),
        sessionId: 's1',
      },
      {
        ...row('decimalDivision', '0.64', '0.064', 2500, 100),
        sessionId: 's1',
      },
      {
        ...row('decimalDivision', '0.64', '0.064', 3000, 100),
        sessionId: 's2',
      },
    ];
    expect(
      calculateReport(current, historical.slice(0, 2)).recurringPatterns,
    ).toEqual([]);
    expect(calculateReport(current, historical).recurringPatterns[0]?.id).toBe(
      'recurring-decimal-division-100',
    );
  });
});
