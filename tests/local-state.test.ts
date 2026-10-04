import { describe, expect, it } from 'vitest';
import {
  ACTIVE_SESSION_KEY,
  loadActiveSession,
  loadOnboardingPreferences,
  saveActiveSession,
  saveOnboardingPreferences,
} from '../lib/local-state';
import { emptyDrillCounts, generateQuestion } from '../lib/questions';
import { distributeFocusedDurations } from '../lib/session-engine';
import type { ActiveSession } from '../lib/nimble-types';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    data,
  };
}

describe('onboarding and recovery state', () => {
  it('defaults to all seven drills and remembers choices without auto-starting', () => {
    const storage = memoryStorage();
    expect(loadOnboardingPreferences(storage).enabledDrills).toHaveLength(7);
    saveOnboardingPreferences(storage, {
      trainingMode: 'mixed',
      enabledDrills: ['decimalDivision', 'decimalMultiplication'],
      customDrills: ['decimalDivision', 'decimalMultiplication'],
      freeDrills: ['addition'],
    });
    expect(loadOnboardingPreferences(storage)).toEqual({
      trainingMode: 'mixed',
      enabledDrills: ['decimalDivision', 'decimalMultiplication'],
      customDrills: ['decimalDivision', 'decimalMultiplication'],
      freeDrills: ['addition'],
    });
    expect(storage.data.has(ACTIVE_SESSION_KEY)).toBe(false);
  });
  it('preserves selected drills, deadlines, counts, and current decimal question', () => {
    const storage = memoryStorage();
    const active: ActiveSession = {
      version: 3,
      id: 'session-1234',
      trainingMode: 'mixed',
      enabledDrills: ['addition', 'decimalDivision'],
      focusedDurationsMs: distributeFocusedDurations(2),
      startedAt: '2026-08-28T10:00:00.000Z',
      startedAtEpochMs: 1000,
      deadlineEpochMs: 601000,
      pausedAtEpochMs: 42000,
      pausedDurationMs: 0,
      currentDrillIndex: 1,
      segmentDeadlineEpochMs: 601000,
      currentQuestion: generateQuestion('decimalDivision', () => 0.5),
      questionShownAtEpochMs: 2000,
      responses: [],
      mixedCounts: { ...emptyDrillCounts(), decimalDivision: 4 },
      recentDrills: ['addition', 'decimalDivision'],
      slowThresholdMs: 5000,
    };
    saveActiveSession(storage, active);
    expect(loadActiveSession(storage)).toEqual(active);
  });
});
