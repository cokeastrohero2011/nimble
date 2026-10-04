import { decimalAnswersEqual } from './decimal';

export const MAX_ANSWER_ATTEMPTS = 3;

export type AnswerAttemptResult = {
  outcome: 'correct' | 'retry' | 'incorrect';
  attemptsUsed: number;
  attemptsRemaining: number;
};

export function answersEqual(
  submitted: string | number,
  correct: string | number,
): boolean {
  return decimalAnswersEqual(String(submitted), String(correct));
}

export function resolveAnswerAttempt(
  submittedAnswer: string | number,
  correctAnswer: string | number,
  attemptsUsed: number,
  maxAttempts = MAX_ANSWER_ATTEMPTS,
): AnswerAttemptResult {
  if (answersEqual(submittedAnswer, correctAnswer)) {
    return {
      outcome: 'correct',
      attemptsUsed,
      attemptsRemaining: Math.max(0, maxAttempts - attemptsUsed),
    };
  }
  const nextAttemptsUsed = Math.min(maxAttempts, attemptsUsed + 1);
  return {
    outcome: nextAttemptsUsed >= maxAttempts ? 'incorrect' : 'retry',
    attemptsUsed: nextAttemptsUsed,
    attemptsRemaining: Math.max(0, maxAttempts - nextAttemptsUsed),
  };
}
