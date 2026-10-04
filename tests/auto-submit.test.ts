import { describe, expect, it } from 'vitest';
import {
  AUTO_SUBMIT_DELAY_MS,
  AutoSubmitController,
  isCompleteAnswer,
  type AutoSubmitTimerApi,
} from '../lib/auto-submit';

type Timer = { due: number; callback: () => void; cancelled: boolean };

function fakeTimers() {
  let now = 0;
  const timers: Timer[] = [];
  const api: AutoSubmitTimerApi = {
    setTimeout(callback, delayMs) {
      const timer = { due: now + delayMs, callback, cancelled: false };
      timers.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout(timer) {
      (timer as unknown as Timer).cancelled = true;
    },
  };
  return {
    api,
    now: () => now,
    advance(ms: number) {
      now += ms;
      for (const timer of [...timers]) {
        if (!timer.cancelled && timer.due <= now) {
          timer.cancelled = true;
          timer.callback();
        }
      }
    },
  };
}

describe('answer auto-submission', () => {
  it('uses one centralized 400 ms delay', () => {
    expect(AUTO_SUBMIT_DELAY_MS).toBe(400);
  });

  it('uses the browser timer with its correct global receiver', async () => {
    const controller = new AutoSubmitController();
    const submitted = await new Promise<string>((resolve) => {
      controller.schedule('7', 'native-timer', (pending) =>
        resolve(pending.value),
      );
    });
    expect(submitted).toBe('7');
  });

  it('does not submit a first digit before the inactivity interval', () => {
    const fake = fakeTimers();
    const controller = new AutoSubmitController(fake.now, fake.api);
    const submitted: string[] = [];
    controller.schedule('7', 'q1', (pending) => submitted.push(pending.value));
    fake.advance(399);
    expect(submitted).toEqual([]);
  });

  it('resets after each character so 7 then 5 submits 75, never 7', () => {
    const fake = fakeTimers();
    const controller = new AutoSubmitController(fake.now, fake.api);
    const submitted: string[] = [];
    controller.schedule('7', 'q1', (pending) => submitted.push(pending.value));
    fake.advance(120);
    controller.schedule('75', 'q1', (pending) => submitted.push(pending.value));
    fake.advance(399);
    expect(submitted).toEqual([]);
    fake.advance(1);
    expect(submitted).toEqual(['75']);
  });

  it('submits a valid single-digit or wrong multi-digit answer after inactivity', () => {
    const fake = fakeTimers();
    const controller = new AutoSubmitController(fake.now, fake.api);
    const submitted: string[] = [];
    controller.schedule('7', 'single', (pending) =>
      submitted.push(pending.value),
    );
    fake.advance(400);
    controller.schedule('73', 'wrong', (pending) =>
      submitted.push(pending.value),
    );
    fake.advance(400);
    expect(submitted).toEqual(['7', '73']);
  });

  it('allows a full decimal answer and never schedules intermediate 0.', () => {
    const fake = fakeTimers();
    const controller = new AutoSubmitController(fake.now, fake.api);
    const submitted: string[] = [];
    controller.schedule('0.', 'intermediate', (pending) =>
      submitted.push(pending.value),
    );
    fake.advance(1000);
    expect(submitted).toEqual([]);
    for (const value of ['0', '0.', '0.0', '0.06', '0.064']) {
      controller.schedule(value, 'decimal', (pending) =>
        submitted.push(pending.value),
      );
      fake.advance(80);
    }
    fake.advance(319);
    expect(submitted).toEqual([]);
    fake.advance(1);
    expect(submitted).toEqual(['0.064']);
    expect(isCompleteAnswer('0.')).toBe(false);
    expect(isCompleteAnswer('12.75')).toBe(true);
  });

  it('takes the submission timestamp from the last keystroke timer', () => {
    const fake = fakeTimers();
    const controller = new AutoSubmitController(fake.now, fake.api);
    let submittedAt = -1;
    fake.advance(1100);
    controller.schedule(
      '7',
      'q1',
      (pending) => (submittedAt = pending.submittedAtMs),
    );
    fake.advance(120);
    controller.schedule(
      '75',
      'q1',
      (pending) => (submittedAt = pending.submittedAtMs),
    );
    fake.advance(400);
    expect(submittedAt).toBe(1620);
  });

  it('cancels stale timers on question change, expiry, drill change, clearing, and unmount', () => {
    const fake = fakeTimers();
    const controller = new AutoSubmitController(fake.now, fake.api);
    const submitted: string[] = [];
    controller.schedule('128', 'old-question', (pending) =>
      submitted.push(pending.questionId),
    );
    controller.cancel(); // question change / session expiry / unmount
    controller.schedule('1000', 'next-question', (pending) =>
      submitted.push(pending.questionId),
    );
    controller.cancel(); // drill transition
    controller.schedule('4.7', 'cleared', (pending) =>
      submitted.push(pending.questionId),
    );
    controller.schedule('', 'cleared', (pending) =>
      submitted.push(pending.questionId),
    ); // backspace to empty
    fake.advance(1000);
    expect(submitted).toEqual([]);
    expect(controller.pending).toBe(false);
  });

  it('handles paste, backspace replacement, and emits at most one callback per answer', () => {
    const fake = fakeTimers();
    const controller = new AutoSubmitController(fake.now, fake.api);
    const submitted: string[] = [];
    controller.schedule('1000', 'paste', (pending) =>
      submitted.push(pending.value),
    );
    fake.advance(400);
    controller.schedule('128', 'backspace', (pending) =>
      submitted.push(pending.value),
    );
    fake.advance(90);
    controller.schedule('12', 'backspace', (pending) =>
      submitted.push(pending.value),
    );
    fake.advance(400);
    expect(submitted).toEqual(['1000', '12']);
  });
});
