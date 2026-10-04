import {
  CORE_DRILLS,
  DRILL_TYPES,
  type ActiveSession,
  type DrillType,
  type OnboardingPreferences,
  type Settings,
  type TrainingMode,
} from './nimble-types';
import { emptyDrillCounts, reconstructQuestion } from './questions';
import { distributeFocusedDurations } from './session-engine';

export const ACTIVE_SESSION_KEY = 'nimble.active-session.v1';
export const SETTINGS_KEY = 'nimble.settings.v1';
export const MODE_KEY = 'nimble.last-mode.v1';
export const ONBOARDING_KEY = 'nimble.onboarding.v3';
export const DEFAULT_SETTINGS: Settings = {
  slowThresholdSeconds: 5,
  sound: false,
  appearance: 'system',
};
export const DEFAULT_ONBOARDING: OnboardingPreferences = {
  trainingMode: 'focused',
  enabledDrills: [...DRILL_TYPES],
  customDrills: [...DRILL_TYPES],
  freeDrills: [...DRILL_TYPES],
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const isDrill = (value: unknown): value is DrillType =>
  typeof value === 'string' &&
  (DRILL_TYPES as readonly string[]).includes(value);

export function loadOnboardingPreferences(
  storage: Pick<Storage, 'getItem'>,
): OnboardingPreferences {
  try {
    const parsed = JSON.parse(
      storage.getItem(ONBOARDING_KEY) ??
        storage.getItem('nimble.onboarding.v2') ??
        'null',
    ) as Partial<OnboardingPreferences> | null;
    const enabled = parsed?.enabledDrills?.filter(isDrill);
    return {
      trainingMode:
        parsed?.trainingMode === 'mixed' ||
        parsed?.trainingMode === 'custom' ||
        parsed?.trainingMode === 'free'
          ? parsed.trainingMode
          : parsed?.trainingMode === 'focused'
            ? 'focused'
            : getRememberedMode(storage),
      enabledDrills: enabled?.length
        ? [...new Set(enabled)]
        : [...DEFAULT_ONBOARDING.enabledDrills],
      customDrills: parsed?.customDrills?.filter(isDrill).length
        ? [...new Set(parsed.customDrills.filter(isDrill))]
        : enabled?.length
          ? [...new Set(enabled)]
          : [...DEFAULT_ONBOARDING.customDrills],
      freeDrills: parsed?.freeDrills?.filter(isDrill).length
        ? [...new Set(parsed.freeDrills.filter(isDrill))]
        : enabled?.length
          ? [...new Set(enabled)]
          : [...DEFAULT_ONBOARDING.freeDrills],
    };
  } catch {
    return {
      ...DEFAULT_ONBOARDING,
      enabledDrills: [...DRILL_TYPES],
      customDrills: [...DRILL_TYPES],
      freeDrills: [...DRILL_TYPES],
    };
  }
}

export function saveOnboardingPreferences(
  storage: Pick<Storage, 'setItem'>,
  value: OnboardingPreferences,
) {
  storage.setItem(ONBOARDING_KEY, JSON.stringify(value));
  storage.setItem(MODE_KEY, value.trainingMode);
}
export function getRememberedMode(
  storage: Pick<Storage, 'getItem'>,
): TrainingMode {
  const value = storage.getItem(MODE_KEY);
  return value === 'mixed' || value === 'custom' || value === 'free'
    ? value
    : 'focused';
}
export function rememberMode(
  storage: Pick<Storage, 'setItem'>,
  mode: TrainingMode,
) {
  storage.setItem(MODE_KEY, mode);
}
export function loadSettings(storage: Pick<Storage, 'getItem'>): Settings {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}'),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: Settings,
) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
export function saveActiveSession(
  storage: StorageLike,
  session: ActiveSession,
) {
  storage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
}

export function loadActiveSession(
  storage: Pick<Storage, 'getItem'>,
): ActiveSession | null {
  try {
    const parsed = JSON.parse(
      storage.getItem(ACTIVE_SESSION_KEY) ?? 'null',
    ) as Record<string, unknown> | null;
    if (
      !parsed ||
      !Array.isArray(parsed.responses) ||
      !['focused', 'mixed', 'custom', 'free'].includes(
        String(parsed.trainingMode),
      )
    )
      return null;
    if (
      parsed.version === 3 &&
      Array.isArray(parsed.enabledDrills) &&
      parsed.enabledDrills.filter(isDrill).length
    )
      return parsed as ActiveSession;
    if (parsed.version === 2 && Array.isArray(parsed.enabledDrills)) {
      return {
        ...(parsed as unknown as ActiveSession),
        version: 3,
        pausedDurationMs: 0,
      };
    }
    if (parsed.version !== 1) return null;
    const legacy = parsed as unknown as Omit<
      ActiveSession,
      'version' | 'enabledDrills' | 'focusedDurationsMs'
    >;
    const current = reconstructQuestion(
      legacy.currentQuestion.drillType,
      legacy.currentQuestion.operands,
    );
    return {
      ...legacy,
      version: 3,
      enabledDrills: [...CORE_DRILLS],
      pausedDurationMs: 0,
      focusedDurationsMs: distributeFocusedDurations(CORE_DRILLS.length),
      currentQuestion: { ...legacy.currentQuestion, ...current },
      mixedCounts: { ...emptyDrillCounts(), ...legacy.mixedCounts },
      responses: legacy.responses.map((row) => {
        const rebuilt = reconstructQuestion(row.drillType, row.operands);
        return {
          ...row,
          correctAnswerText: String(row.correctAnswer),
          submittedAnswerText: String(row.submittedAnswer),
          metadata: rebuilt.metadata,
        };
      }),
    };
  } catch {
    return null;
  }
}
export function clearActiveSession(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(ACTIVE_SESSION_KEY);
}
