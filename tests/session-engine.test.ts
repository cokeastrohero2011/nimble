import { describe, expect, it } from 'vitest';
import {
  activeElapsedMs,
  currentFocusedDrill,
  distributeFocusedDurations,
  focusedDrillIndex,
  pauseActiveSession,
  resumeActiveSession,
  sessionExpired,
  SESSION_DURATION_MS,
} from '../lib/session-engine';
import {
  CORE_DRILLS,
  DRILL_TYPES,
  type ActiveSession,
} from '../lib/nimble-types';
import { emptyDrillCounts, generateQuestion } from '../lib/questions';

const buildSession = (): ActiveSession => {
  const start = 1_000_000;
  return {
    version: 3,
    id: 'session-test',
    trainingMode: 'focused',
    enabledDrills: [...CORE_DRILLS],
    focusedDurationsMs: distributeFocusedDurations(5),
    startedAt: new Date(start).toISOString(),
    startedAtEpochMs: start,
    deadlineEpochMs: start + SESSION_DURATION_MS,
    pausedDurationMs: 0,
    currentDrillIndex: 0,
    segmentDeadlineEpochMs: start + 120_000,
    currentQuestion: generateQuestion('addition', () => 0),
    questionShownAtEpochMs: start,
    responses: [],
    mixedCounts: emptyDrillCounts(),
    recentDrills: [],
    slowThresholdMs: 5000,
  };
};

describe('session timing', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'distributes %i focused drills to exactly 600,000 ms',
    (count) => {
      const durations = distributeFocusedDurations(count);
      expect(durations).toHaveLength(count);
      expect(durations.reduce((sum, value) => sum + value, 0)).toBe(600_000);
      expect(
        Math.max(...durations) - Math.min(...durations),
      ).toBeLessThanOrEqual(1);
    },
  );

  it('preserves the original five exact 120-second periods', () => {
    const durations = distributeFocusedDurations(5);
    expect(durations).toEqual([120_000, 120_000, 120_000, 120_000, 120_000]);
    expect(currentFocusedDrill(119_999, CORE_DRILLS, durations)).toBe(
      'addition',
    );
    expect(currentFocusedDrill(120_000, CORE_DRILLS, durations)).toBe(
      'multiplication',
    );
    expect(focusedDrillIndex(599_999, durations)).toBe(4);
  });

  it('distributes the seven-drill remainder deterministically', () => {
    expect(distributeFocusedDurations(DRILL_TYPES.length)).toEqual([
      85_715, 85_715, 85_714, 85_714, 85_714, 85_714, 85_714,
    ]);
  });

  it('expires at exactly 600 seconds and excludes onboarding time', () => {
    expect(sessionExpired(1_000, 600_999)).toBe(false);
    expect(sessionExpired(1_000, 601_000)).toBe(true);
  });

  it('freezes active time while paused and shifts both deadlines', () => {
    const session = buildSession();
    const paused = pauseActiveSession(
      session,
      session.startedAtEpochMs + 30_000,
    );
    expect(activeElapsedMs(paused, session.startedAtEpochMs + 180_000)).toBe(
      30_000,
    );
    const resumed = resumeActiveSession(
      paused,
      session.startedAtEpochMs + 180_000,
    );
    expect(resumed.deadlineEpochMs).toBe(session.deadlineEpochMs + 150_000);
    expect(resumed.segmentDeadlineEpochMs).toBe(
      session.segmentDeadlineEpochMs + 150_000,
    );
  });
});
