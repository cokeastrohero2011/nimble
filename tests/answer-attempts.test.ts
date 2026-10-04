import { describe, expect, it } from 'vitest';
import {
  answersEqual,
  MAX_ANSWER_ATTEMPTS,
  resolveAnswerAttempt,
} from '../lib/answer-attempts';

describe('automatic answer attempts', () => {
  it('accepts exact equivalent decimals without floating-point comparison', () => {
    expect(answersEqual('0.50', '0.5')).toBe(true);
    expect(resolveAnswerAttempt('0.050', '0.05', 0)).toEqual({
      outcome: 'correct',
      attemptsUsed: 0,
      attemptsRemaining: MAX_ANSWER_ATTEMPTS,
    });
  });
  it('allows two retries and records the third wrong answer', () => {
    const first = resolveAnswerAttempt('14', '15', 0);
    const second = resolveAnswerAttempt('16', '15', first.attemptsUsed);
    const third = resolveAnswerAttempt('17', '15', second.attemptsUsed);
    expect(first).toMatchObject({ outcome: 'retry', attemptsRemaining: 2 });
    expect(second).toMatchObject({ outcome: 'retry', attemptsRemaining: 1 });
    expect(third).toMatchObject({ outcome: 'incorrect', attemptsRemaining: 0 });
  });
});
