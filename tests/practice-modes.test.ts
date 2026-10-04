import { describe, expect, it } from 'vitest';
import { chooseMixedDrill, emptyDrillCounts } from '../lib/questions';
import {
  loadOnboardingPreferences,
  saveOnboardingPreferences,
} from '../lib/local-state';
import { activeElapsedMs, SESSION_DURATION_MS } from '../lib/session-engine';
import type { ActiveSession, DrillType } from '../lib/nimble-types';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const freeSession = (): Pick<
  ActiveSession,
  | 'startedAtEpochMs'
  | 'deadlineEpochMs'
  | 'pausedAtEpochMs'
  | 'pausedDurationMs'
  | 'trainingMode'
> => ({
  startedAtEpochMs: 1_000,
  deadlineEpochMs: Number.MAX_SAFE_INTEGER,
  pausedDurationMs: 0,
  trainingMode: 'free',
});

function selectMany(enabled: readonly DrillType[], count: number) {
  const counts = emptyDrillCounts();
  const recent: DrillType[] = [];
  const selected: DrillType[] = [];
  let seed = 17;
  const rng = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let index = 0; index < count; index++) {
    const drill = chooseMixedDrill(counts, recent, rng, enabled);
    selected.push(drill);
    counts[drill] += 1;
    recent.push(drill);
    if (recent.length > 6) recent.shift();
  }
  return { counts, selected };
}

describe('Custom 10-Min and Free Practice', () => {
  it('keeps a one-drill custom selection exclusive', () => {
    const { selected } = selectMany(['addition'], 80);
    expect(new Set(selected)).toEqual(new Set(['addition']));
  });

  it('balances only custom-selected drills and never introduces disabled drills', () => {
    const enabled = ['addition', 'subtraction', 'decimalDivision'] as const;
    const { counts, selected } = selectMany(enabled, 300);
    expect(new Set(selected)).toEqual(new Set(enabled));
    expect(
      Math.max(...enabled.map((drill) => counts[drill])),
    ).toBeLessThanOrEqual(
      Math.min(...enabled.map((drill) => counts[drill])) + 2,
    );
    expect(counts.multiplication).toBe(0);
    expect(counts.bonds100).toBe(0);
  });

  it('keeps long-running Free Practice balanced without a fixed-cycle pattern', () => {
    const enabled = ['addition', 'multiplication', 'bonds100'] as const;
    const { counts, selected } = selectMany(enabled, 1_000);
    expect(new Set(selected)).toEqual(new Set(enabled));
    expect(
      Math.max(...enabled.map((drill) => counts[drill])),
    ).toBeLessThanOrEqual(
      Math.min(...enabled.map((drill) => counts[drill])) + 2,
    );
    for (let index = 2; index < selected.length; index++)
      expect(
        selected[index] === selected[index - 1] &&
          selected[index] === selected[index - 2],
      ).toBe(false);
  });

  it('does not cap Free Practice elapsed time at ten minutes', () => {
    const session = freeSession();
    expect(
      activeElapsedMs(
        session,
        session.startedAtEpochMs + SESSION_DURATION_MS + 17_000,
      ),
    ).toBe(SESSION_DURATION_MS + 17_000);
  });

  it('persists Custom and Free mode selections separately', () => {
    const local = storage();
    saveOnboardingPreferences(local, {
      trainingMode: 'free',
      enabledDrills: ['addition', 'multiplication'],
      customDrills: ['subtraction'],
      freeDrills: ['decimalDivision', 'decimalMultiplication'],
    });
    expect(loadOnboardingPreferences(local)).toEqual({
      trainingMode: 'free',
      enabledDrills: ['addition', 'multiplication'],
      customDrills: ['subtraction'],
      freeDrills: ['decimalDivision', 'decimalMultiplication'],
    });
  });
});
