import {
  DRILL_TYPES,
  type ActiveSession,
  type DrillType,
  type TrainingMode,
} from './nimble-types';

export const DRILL_DURATION_MS = 120_000;
export const SESSION_DURATION_MS = 600_000;

export function distributeFocusedDurations(count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > DRILL_TYPES.length)
    throw new Error('Focused sessions require between 1 and 7 drills');
  const base = Math.floor(SESSION_DURATION_MS / count);
  const remainder = SESSION_DURATION_MS - base * count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

export function focusedDrillIndex(
  elapsedMs: number,
  durations = distributeFocusedDurations(5),
): number {
  const safeElapsed = Math.max(0, elapsedMs);
  let boundary = 0;
  for (let index = 0; index < durations.length; index++) {
    boundary += durations[index];
    if (safeElapsed < boundary) return index;
  }
  return durations.length - 1;
}

export function currentFocusedDrill(
  elapsedMs: number,
  enabledDrills: readonly DrillType[] = DRILL_TYPES.slice(0, 5),
  durations = distributeFocusedDurations(enabledDrills.length),
): DrillType {
  return enabledDrills[focusedDrillIndex(elapsedMs, durations)];
}

export function focusedSegmentStartOffset(
  durations: readonly number[],
  index: number,
): number {
  return durations.slice(0, index).reduce((sum, duration) => sum + duration, 0);
}

export const sessionExpired = (startedAtEpochMs: number, nowEpochMs: number) =>
  nowEpochMs >= startedAtEpochMs + SESSION_DURATION_MS;

export function remainingMs(
  session: Pick<
    ActiveSession,
    | 'deadlineEpochMs'
    | 'segmentDeadlineEpochMs'
    | 'trainingMode'
    | 'pausedAtEpochMs'
  >,
  now: number,
) {
  const deadline =
    session.trainingMode === 'focused'
      ? session.segmentDeadlineEpochMs
      : session.deadlineEpochMs;
  return Math.max(0, deadline - (session.pausedAtEpochMs ?? now));
}

export function pauseActiveSession(
  session: ActiveSession,
  nowEpochMs: number,
): ActiveSession {
  return session.pausedAtEpochMs === undefined
    ? { ...session, pausedAtEpochMs: nowEpochMs }
    : session;
}

export function resumeActiveSession(
  session: ActiveSession,
  nowEpochMs: number,
): ActiveSession {
  if (session.pausedAtEpochMs === undefined) return session;
  const paused = Math.max(0, nowEpochMs - session.pausedAtEpochMs);
  const isFree = session.trainingMode === 'free';
  return {
    ...session,
    deadlineEpochMs: isFree
      ? session.deadlineEpochMs
      : session.deadlineEpochMs + paused,
    segmentDeadlineEpochMs: isFree
      ? session.segmentDeadlineEpochMs
      : session.segmentDeadlineEpochMs + paused,
    questionShownAtEpochMs: session.questionShownAtEpochMs + paused,
    pausedDurationMs: session.pausedDurationMs + paused,
    pausedAtEpochMs: undefined,
  };
}

export function activeElapsedMs(
  session: Pick<
    ActiveSession,
    | 'startedAtEpochMs'
    | 'deadlineEpochMs'
    | 'pausedAtEpochMs'
    | 'pausedDurationMs'
    | 'trainingMode'
  >,
  nowEpochMs: number,
): number {
  const effectiveNow = session.pausedAtEpochMs ?? nowEpochMs;
  const elapsed = Math.max(
    0,
    effectiveNow - session.startedAtEpochMs - session.pausedDurationMs,
  );
  return session.trainingMode === 'free'
    ? elapsed
    : Math.min(SESSION_DURATION_MS, elapsed);
}

export function normalizeMode(value: unknown): TrainingMode | null {
  return value === 'focused' ||
    value === 'mixed' ||
    value === 'custom' ||
    value === 'free'
    ? value
    : null;
}
