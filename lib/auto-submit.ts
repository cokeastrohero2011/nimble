import { normalizeDecimal } from './decimal';

export const AUTO_SUBMIT_DELAY_MS = 400;

export type AutoSubmitClock = () => number;
export type AutoSubmitTimerApi = {
  setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
};

export type PendingSubmission = {
  questionId: string;
  value: string;
  submittedAtMs: number;
};

const browserTimers: AutoSubmitTimerApi = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
};

/** A trailing decimal point is a typing state, not a complete answer. */
export function isCompleteAnswer(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed !== '' &&
    !trimmed.endsWith('.') &&
    normalizeDecimal(trimmed) !== null
  );
}

/**
 * Keeps only the most recent input eligible for submission. The token lets the
 * consumer reject a callback after a question has changed.
 */
export class AutoSubmitController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(
    private readonly clock: AutoSubmitClock = () => performance.now(),
    private readonly timers: AutoSubmitTimerApi = browserTimers,
    private readonly delayMs = AUTO_SUBMIT_DELAY_MS,
  ) {}

  schedule(
    value: string,
    questionId: string,
    submit: (pending: PendingSubmission) => void,
  ) {
    this.cancel();
    if (!isCompleteAnswer(value)) return;

    const generation = ++this.generation;
    this.timer = this.timers.setTimeout(() => {
      if (generation !== this.generation) return;
      this.timer = null;
      submit({
        value,
        questionId,
        submittedAtMs: this.clock(),
      });
    }, this.delayMs);
  }

  cancel() {
    this.generation += 1;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  get pending() {
    return this.timer !== null;
  }
}
