'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  History,
  Pause,
  Play,
  Settings as SettingsIcon,
  Square,
  Timer,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MAX_ANSWER_ATTEMPTS,
  resolveAnswerAttempt,
} from '@/lib/answer-attempts';
import { AutoSubmitController } from '@/lib/auto-submit';
import { Input } from '@/components/ui/input';
import { sanitizeDecimalInput } from '@/lib/decimal';
import { Switch } from '@/components/ui/switch';
import {
  CORE_DRILLS,
  DECIMAL_DRILLS,
  DRILL_LABELS,
  DRILL_TYPES,
  type ActiveSession,
  type DrillType,
  type HistoryItem,
  type Question,
  type Report,
  type ResponseRecord,
  type SessionPayload,
  type Settings,
  type TrainingMode,
} from '@/lib/nimble-types';
import {
  chooseMixedDrill,
  emptyDrillCounts,
  generateQuestion,
  questionUsesOne,
} from '@/lib/questions';
import {
  calculateReport,
  classifyPracticeReason,
  isSlowResponse,
} from '@/lib/report';
import {
  activeElapsedMs,
  distributeFocusedDurations,
  focusedDrillIndex,
  focusedSegmentStartOffset,
  pauseActiveSession,
  resumeActiveSession,
  SESSION_DURATION_MS,
} from '@/lib/session-engine';
import {
  clearActiveSession,
  loadActiveSession,
  loadOnboardingPreferences,
  loadSettings,
  saveActiveSession,
  saveOnboardingPreferences,
  saveSettings,
} from '@/lib/local-state';

type View =
  | 'home'
  | 'onboarding'
  | 'session'
  | 'history'
  | 'settings'
  | 'report';

const newId = () => crypto.randomUUID();
const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} sec`;
const formatClock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const formatDate = (date: string, long = false) =>
  new Intl.DateTimeFormat(
    undefined,
    long
      ? { month: 'long', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  ).format(new Date(date));
const percent = (value: number) => `${Math.round(value)}%`;
const modeLabel = (mode: TrainingMode) =>
  mode === 'custom'
    ? 'Custom 10-Min'
    : mode === 'free'
      ? 'Free Practice'
      : mode === 'focused'
        ? 'Focused'
        : 'Mixed';
const sameLocalDay = (value: string, date = new Date()) => {
  const candidate = new Date(value);
  return (
    candidate.getFullYear() === date.getFullYear() &&
    candidate.getMonth() === date.getMonth() &&
    candidate.getDate() === date.getDate()
  );
};
const questionKey = (question: Question | ResponseRecord) =>
  `${question.drillType}:${question.operands.a}:${question.operands.b}:${question.operands.missingSide ?? ''}:${question.operands.decimalValue ?? ''}:${question.operands.factor ?? ''}`;

function Logo() {
  return (
    <button
      className="wordmark"
      onClick={() => location.reload()}
      aria-label="Nimble home"
    >
      Nimble
    </button>
  );
}

function Shell({
  children,
  onNavigate,
  compact = false,
}: {
  children: React.ReactNode;
  onNavigate: (view: View) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'app-shell compact' : 'app-shell'}>
      <header className="topbar">
        <Logo />
        {!compact && (
          <nav aria-label="Primary navigation">
            <button onClick={() => onNavigate('history')}>
              <History /> History
            </button>
            <button onClick={() => onNavigate('settings')}>
              <SettingsIcon /> Settings
            </button>
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}

export function NimbleApp() {
  const [view, setView] = useState<View>('home');
  const [mode, setMode] = useState<TrainingMode>('focused');
  const [enabledDrills, setEnabledDrills] = useState<DrillType[]>([
    ...DRILL_TYPES,
  ]);
  const [customDrills, setCustomDrills] = useState<DrillType[]>([
    ...DRILL_TYPES,
  ]);
  const [freeDrills, setFreeDrills] = useState<DrillType[]>([...DRILL_TYPES]);
  const [settings, setSettingsState] = useState<Settings>({
    slowThresholdSeconds: 5,
    sound: false,
    appearance: 'system',
  });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [saveWarning, setSaveWarning] = useState('');
  const [recovered, setRecovered] = useState(false);
  const initialized = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('History request failed');
      const data = (await response.json()) as { sessions: HistoryItem[] };
      setHistory(data.sessions);
      setHistoryError('');
    } catch {
      setHistoryError(
        'History will appear after the local D1 database is ready.',
      );
    }
  }, []);

  const finishSession = useCallback(
    async (session: ActiveSession) => {
      const payload: SessionPayload = {
        id: session.id,
        trainingMode: session.trainingMode,
        enabledDrills: session.enabledDrills,
        startedAt: session.startedAt,
        completedAt: new Date().toISOString(),
        durationMs:
          session.trainingMode === 'free'
            ? Math.round(activeElapsedMs(session, Date.now()))
            : SESSION_DURATION_MS,
        slowThresholdMs: session.slowThresholdMs,
        responses: session.responses,
      };
      const localReport = calculateReport(payload);
      setActive(null);
      setReport(localReport);
      setView('report');
      try {
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok && response.status !== 409)
          throw new Error('Save failed');
        const reportResponse =
          response.status === 409
            ? await fetch(`/api/sessions/${encodeURIComponent(payload.id)}`)
            : response;
        if (reportResponse.ok) {
          const saved = (await reportResponse.json()) as { report: Report };
          setReport(saved.report);
        }
        clearActiveSession(localStorage);
        setSaveWarning('');
        void loadHistory();
      } catch {
        setSaveWarning(
          'Your report is safe on this device, but it has not reached D1 yet. Reopen Nimble to retry.',
        );
      }
    },
    [loadHistory],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const loadedSettings = loadSettings(localStorage);
    setSettingsState(loadedSettings);
    const preferences = loadOnboardingPreferences(localStorage);
    setMode(preferences.trainingMode);
    setEnabledDrills(preferences.enabledDrills);
    setCustomDrills(preferences.customDrills);
    setFreeDrills(preferences.freeDrills);
    void loadHistory();
    const stored = loadActiveSession(localStorage);
    if (stored) {
      setRecovered(true);
      if (
        stored.trainingMode !== 'free' &&
        stored.pausedAtEpochMs === undefined &&
        Date.now() >= stored.deadlineEpochMs
      )
        void finishSession(stored);
      else {
        const index =
          stored.trainingMode === 'focused'
            ? focusedDrillIndex(
                activeElapsedMs(stored, Date.now()),
                stored.focusedDurationsMs,
              )
            : stored.currentDrillIndex;
        let restored =
          index === stored.currentDrillIndex
            ? stored
            : transitionFocused(stored, index);
        if (questionUsesOne(restored.currentQuestion)) {
          const drill = restored.currentQuestion.drillType;
          restored = {
            ...restored,
            currentQuestion: generateQuestion(drill),
            questionShownAtEpochMs: Date.now(),
          };
          saveActiveSession(localStorage, restored);
        }
        setActive(restored);
        setView('session');
      }
    }
  }, [finishSession, loadHistory]);

  useEffect(() => {
    const apply = () => {
      const dark =
        settings.appearance === 'dark' ||
        (settings.appearance === 'system' &&
          matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.appearance]);

  const navigate = (next: View) => {
    setView(next);
    if (next === 'history') void loadHistory();
    window.scrollTo({ top: 0 });
  };

  const begin = () => {
    const now = Date.now();
    const selectedDrills =
      mode === 'custom'
        ? customDrills
        : mode === 'free'
          ? freeDrills
          : enabledDrills;
    const focusedDurationsMs = distributeFocusedDurations(
      selectedDrills.length,
    );
    const drill =
      mode === 'focused'
        ? selectedDrills[0]
        : chooseMixedDrill(emptyDrillCounts(), [], Math.random, selectedDrills);
    const question = generateQuestion(drill);
    const session: ActiveSession = {
      version: 3,
      id: newId(),
      trainingMode: mode,
      enabledDrills: selectedDrills,
      focusedDurationsMs,
      startedAt: new Date(now).toISOString(),
      startedAtEpochMs: now,
      deadlineEpochMs:
        mode === 'free' ? Number.MAX_SAFE_INTEGER : now + SESSION_DURATION_MS,
      pausedDurationMs: 0,
      currentDrillIndex: mode === 'focused' ? 0 : selectedDrills.indexOf(drill),
      segmentDeadlineEpochMs:
        mode === 'free'
          ? Number.MAX_SAFE_INTEGER
          : now +
            (mode === 'focused' ? focusedDurationsMs[0] : SESSION_DURATION_MS),
      currentQuestion: question,
      questionShownAtEpochMs: now,
      responses: [],
      mixedCounts: emptyDrillCounts(),
      recentDrills: mode === 'focused' ? [] : [drill],
      slowThresholdMs: Math.round(settings.slowThresholdSeconds * 1000),
    };
    saveOnboardingPreferences(localStorage, {
      trainingMode: mode,
      enabledDrills,
      customDrills,
      freeDrills,
    });
    saveActiveSession(localStorage, session);
    setRecovered(false);
    setActive(session);
    setView('session');
  };

  const updateSettings = (next: Settings) => {
    setSettingsState(next);
    saveSettings(localStorage, next);
  };

  const stopSession = () => {
    clearActiveSession(localStorage);
    setActive(null);
    setRecovered(false);
    setSaveWarning('');
    setView('home');
  };

  if (view === 'session' && active) {
    return (
      <SessionScreen
        session={active}
        settings={settings}
        recovered={recovered}
        onChange={(next) => {
          setActive(next);
          saveActiveSession(localStorage, next);
        }}
        onFinish={finishSession}
        onStop={stopSession}
      />
    );
  }

  if (view === 'onboarding')
    return (
      <Onboarding
        mode={mode}
        enabledDrills={enabledDrills}
        customDrills={customDrills}
        freeDrills={freeDrills}
        onMode={setMode}
        onEnabledDrills={setEnabledDrills}
        onCustomDrills={setCustomDrills}
        onFreeDrills={setFreeDrills}
        onStart={begin}
        onBack={() => navigate('home')}
      />
    );
  if (view === 'history')
    return (
      <HistoryScreen
        items={history}
        error={historyError}
        onBack={() => navigate('home')}
        onSelect={async (id) => {
          const response = await fetch(
            `/api/sessions/${encodeURIComponent(id)}`,
          );
          if (response.ok) {
            const data = (await response.json()) as { report: Report };
            setReport(data.report);
            setSaveWarning('');
            navigate('report');
          }
        }}
      />
    );
  if (view === 'settings')
    return (
      <SettingsScreen
        settings={settings}
        onChange={updateSettings}
        onBack={() => navigate('home')}
      />
    );
  if (view === 'report' && report)
    return (
      <ReportScreen
        report={report}
        saveWarning={saveWarning}
        onBack={() => navigate('home')}
      />
    );

  return (
    <HomeScreen
      history={history}
      error={historyError}
      onStart={() => navigate('onboarding')}
      onNavigate={navigate}
    />
  );
}

function HomeScreen({
  history,
  error,
  onStart,
  onNavigate,
}: {
  history: HistoryItem[];
  error: string;
  onStart: () => void;
  onNavigate: (view: View) => void;
}) {
  const today = history.find((item) => sameLocalDay(item.completedAt));
  return (
    <Shell onNavigate={onNavigate}>
      <main className="home">
        <section className="home-intro">
          <p className="eyebrow">Daily practice</p>
          <h1>Nimble</h1>
          <p className="subtitle">10 minutes of mental math</p>
          {today && (
            <div className="today-complete">
              <Check /> <span>Today’s session completed</span>
              <strong>
                {percent(today.accuracy)} ·{' '}
                {formatSeconds(today.averageResponseTimeMs)} avg
              </strong>
            </div>
          )}
          <Button className="primary-cta" onClick={onStart}>
            Start <ArrowRight />
          </Button>
        </section>
        <section className="recent-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recent progress</p>
              <h2>Last seven sessions</h2>
            </div>
            <button onClick={() => onNavigate('history')}>
              View all <ArrowRight />
            </button>
          </div>
          {error && !history.length ? (
            <p className="muted-message">{error}</p>
          ) : (
            <RecentTable items={history.slice(0, 7)} />
          )}
        </section>
      </main>
    </Shell>
  );
}

function RecentTable({ items }: { items: HistoryItem[] }) {
  if (!items.length)
    return (
      <div className="empty-state">
        <span>01</span>
        <p>Your completed sessions will build a clear record here.</p>
      </div>
    );
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Style</th>
            <th>Accuracy</th>
            <th>Avg time</th>
            <th>Slow</th>
            <th>Mistakes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{formatDate(item.completedAt)}</td>
              <td>{modeLabel(item.trainingMode)}</td>
              <td>{percent(item.accuracy)}</td>
              <td>{formatSeconds(item.averageResponseTimeMs)}</td>
              <td>{item.slowCount}</td>
              <td>{item.incorrectCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Onboarding({
  mode,
  enabledDrills,
  customDrills,
  freeDrills,
  onMode,
  onEnabledDrills,
  onCustomDrills,
  onFreeDrills,
  onStart,
  onBack,
}: {
  mode: TrainingMode;
  enabledDrills: DrillType[];
  customDrills: DrillType[];
  freeDrills: DrillType[];
  onMode: (mode: TrainingMode) => void;
  onEnabledDrills: (drills: DrillType[]) => void;
  onCustomDrills: (drills: DrillType[]) => void;
  onFreeDrills: (drills: DrillType[]) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const selectedDrills =
    mode === 'custom'
      ? customDrills
      : mode === 'free'
        ? freeDrills
        : enabledDrills;
  const setSelectedDrills =
    mode === 'custom'
      ? onCustomDrills
      : mode === 'free'
        ? onFreeDrills
        : onEnabledDrills;
  const needsSelection = mode === 'custom' || mode === 'free';
  const setPreset = (drills: readonly DrillType[]) =>
    setSelectedDrills([...drills]);
  const toggle = (drill: DrillType) => {
    if (selectedDrills.includes(drill)) {
      if (selectedDrills.length > 1)
        setSelectedDrills(selectedDrills.filter((item) => item !== drill));
    } else {
      setSelectedDrills(
        DRILL_TYPES.filter((item) => [...selectedDrills, drill].includes(item)),
      );
    }
  };
  const modes: Array<{
    value: TrainingMode;
    title: string;
    description: string;
  }> = [
    {
      value: 'focused',
      title: 'Focused',
      description: 'One selected skill at a time, sharing 10 minutes.',
    },
    {
      value: 'mixed',
      title: 'Mixed',
      description: 'All selected skills interleaved for 10 minutes.',
    },
    {
      value: 'custom',
      title: 'Custom 10-Min',
      description: 'Choose exactly what to practise, mixed for 10 minutes.',
    },
    {
      value: 'free',
      title: 'Free Practice',
      description: 'Choose skills and continue until you finish.',
    },
  ];
  return (
    <Shell compact onNavigate={() => undefined}>
      <main className="onboarding page-narrow">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft /> Back
        </button>
        <p className="eyebrow">Choose practice style</p>
        <h1>How do you want to practice today?</h1>
        <div
          className="mode-grid"
          role="radiogroup"
          aria-label="Practice style"
        >
          {modes.map((option, index) => (
            <button
              key={option.value}
              role="radio"
              aria-checked={mode === option.value}
              className={[
                'mode-card',
                mode === option.value ? 'selected' : '',
              ].join(' ')}
              onClick={() => onMode(option.value)}
            >
              <span className="mode-number">0{index + 1}</span>
              <span className="mode-check">
                <Check />
              </span>
              <h2>{option.title}</h2>
              <p>{option.description}</p>
              {option.value === 'mixed' && (
                <div className="mixed-sample">
                  <span>7 � 8</span>
                  <span>6.4 � 100</span>
                  <span>37 + ? = 100</span>
                </div>
              )}
            </button>
          ))}
        </div>
        {needsSelection && (
          <section
            className="practice-areas"
            aria-labelledby="practice-areas-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Practice areas</p>
                <h2 id="practice-areas-title">Choose your drills</h2>
              </div>
            </div>
            <div className="preset-row" aria-label="Practice area presets">
              <button type="button" onClick={() => setPreset(CORE_DRILLS)}>
                Core
              </button>
              <button type="button" onClick={() => setPreset(DECIMAL_DRILLS)}>
                Decimals
              </button>
              <button type="button" onClick={() => setPreset(DRILL_TYPES)}>
                All
              </button>
            </div>
            <div className="drill-toggle-grid">
              {DRILL_TYPES.map((drill) => (
                <button
                  type="button"
                  key={drill}
                  className={selectedDrills.includes(drill) ? 'selected' : ''}
                  aria-pressed={selectedDrills.includes(drill)}
                  onClick={() => toggle(drill)}
                >
                  <span>
                    {selectedDrills.includes(drill) ? <Check /> : null}
                  </span>
                  {DRILL_LABELS[drill]}
                </button>
              ))}
            </div>
          </section>
        )}
        <p className="ten-minutes">
          <Timer /> {mode === 'free' ? 'No time limit' : '10 minutes total'} �{' '}
          {selectedDrills.length}{' '}
          {selectedDrills.length === 1 ? 'area' : 'areas'}
        </p>
        <Button className="start-session" onClick={onStart}>
          Start <ArrowRight />
        </Button>
      </main>
    </Shell>
  );
}

function transitionFocused(
  session: ActiveSession,
  index: number,
): ActiveSession {
  const drill = session.enabledDrills[index];
  const next = {
    ...session,
    currentDrillIndex: index,
    segmentDeadlineEpochMs:
      session.startedAtEpochMs +
      focusedSegmentStartOffset(session.focusedDurationsMs, index + 1) +
      Math.max(
        0,
        session.deadlineEpochMs -
          session.startedAtEpochMs -
          SESSION_DURATION_MS,
      ),
    currentQuestion: generateQuestion(
      drill,
      Math.random,
      questionKey(session.currentQuestion),
    ),
    questionShownAtEpochMs: Date.now(),
  };
  return next;
}

function SessionScreen({
  session,
  settings,
  recovered,
  onChange,
  onFinish,
  onStop,
}: {
  session: ActiveSession;
  settings: Settings;
  recovered: boolean;
  onChange: (session: ActiveSession) => void;
  onFinish: (session: ActiveSession) => void;
  onStop: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ correct: string } | null>(null);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [retryMessage, setRetryMessage] = useState('');
  const [stopPrompt, setStopPrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const shownAtPerformance = useRef(performance.now());
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmit = useRef<AutoSubmitController | null>(null);
  if (autoSubmit.current === null)
    autoSubmit.current = new AutoSubmitController();
  const pauseStartedPerformance = useRef<number | null>(null);
  const resumeAfterStopCancel = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useLayoutEffect(() => {
    autoSubmit.current?.cancel();
    shownAtPerformance.current = performance.now();
    setAnswer('');
    setAttemptsUsed(0);
    setRetryMessage('');
    pauseStartedPerformance.current =
      sessionRef.current.pausedAtEpochMs === undefined
        ? null
        : performance.now();
    if (sessionRef.current.pausedAtEpochMs === undefined)
      inputRef.current?.focus();
  }, [session.currentQuestion.id]);

  const advanceQuestion = useCallback((base: ActiveSession) => {
    const previous = questionKey(base.currentQuestion);
    let drill = base.currentQuestion.drillType;
    let recent = base.recentDrills;
    if (base.trainingMode !== 'focused') {
      drill = chooseMixedDrill(
        base.mixedCounts,
        recent,
        Math.random,
        base.enabledDrills,
      );
      recent = [...recent, drill].slice(-6);
    }
    const exposure: Record<string, number> = {};
    for (const row of base.responses)
      exposure[questionKey(row)] = (exposure[questionKey(row)] ?? 0) + 1;
    return {
      ...base,
      currentDrillIndex: base.enabledDrills.indexOf(drill),
      currentQuestion: generateQuestion(drill, Math.random, previous, exposure),
      questionShownAtEpochMs: Date.now(),
      recentDrills: recent,
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);
      const current = sessionRef.current;
      if (current.pausedAtEpochMs !== undefined) return;
      if (
        current.trainingMode !== 'free' &&
        currentNow >= current.deadlineEpochMs
      ) {
        if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
        autoSubmit.current?.cancel();
        locked.current = true;
        void onFinish(current);
        return;
      }
      if (current.trainingMode === 'focused') {
        const expected = focusedDrillIndex(
          activeElapsedMs(current, currentNow),
          current.focusedDurationsMs,
        );
        if (expected !== current.currentDrillIndex) {
          if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
          autoSubmit.current?.cancel();
          locked.current = false;
          setFeedback(null);
          setAttemptsUsed(0);
          setRetryMessage('');
          setAnswer('');
          onChange(transitionFocused(current, expected));
        }
      }
    }, 50);
    return () => clearInterval(timer);
  }, [onChange, onFinish]);

  const playWrong = useCallback(() => {
    if (!settings.sound) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 180;
    gain.gain.setValueAtTime(0.05, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  }, [settings.sound]);

  const pauseSession = () => {
    const current = sessionRef.current;
    if (current.pausedAtEpochMs !== undefined) return;
    autoSubmit.current?.cancel();
    setAnswer('');
    pauseStartedPerformance.current = performance.now();
    onChange(pauseActiveSession(current, Date.now()));
  };

  const resumeSession = () => {
    const current = sessionRef.current;
    if (current.pausedAtEpochMs === undefined) return;
    const pausedPerformanceMs =
      pauseStartedPerformance.current === null
        ? 0
        : Math.max(0, performance.now() - pauseStartedPerformance.current);
    shownAtPerformance.current += pausedPerformanceMs;
    pauseStartedPerformance.current = null;
    onChange(resumeActiveSession(current, Date.now()));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const requestStop = () => {
    const current = sessionRef.current;
    autoSubmit.current?.cancel();
    setAnswer('');
    if (current.trainingMode === 'free') {
      resumeAfterStopCancel.current = false;
      setStopPrompt(true);
      return;
    }
    resumeAfterStopCancel.current = current.pausedAtEpochMs === undefined;
    if (resumeAfterStopCancel.current) pauseSession();
    setStopPrompt(true);
  };

  const cancelStop = () => {
    setStopPrompt(false);
    if (resumeAfterStopCancel.current) resumeSession();
    resumeAfterStopCancel.current = false;
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const finishFreeSession = () => {
    if (locked.current) return;
    autoSubmit.current?.cancel();
    setAnswer('');
    locked.current = true;
    void onFinish(sessionRef.current);
  };

  const attemptAnswer = useCallback(
    (submitted: string, questionId: string, submittedAtMs: number) => {
      if (locked.current || submitted.trim() === '') return;
      const current = sessionRef.current;
      if (
        current.currentQuestion.id !== questionId ||
        current.pausedAtEpochMs !== undefined ||
        Date.now() >= current.deadlineEpochMs ||
        (current.trainingMode === 'focused' &&
          Date.now() >= current.segmentDeadlineEpochMs)
      ) {
        autoSubmit.current?.cancel();
        return;
      }

      const question = current.currentQuestion;
      const result = resolveAnswerAttempt(
        submitted,
        question.correctAnswerText,
        attemptsUsed,
      );
      if (result.outcome === 'retry') {
        playWrong();
        setAttemptsUsed(result.attemptsUsed);
        setRetryMessage(
          `Try again · ${result.attemptsRemaining} ${result.attemptsRemaining === 1 ? 'try' : 'tries'} left`,
        );
        setAnswer('');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      autoSubmit.current?.cancel();
      locked.current = true;
      const responseTimeMs = Math.max(
        0,
        submittedAtMs - shownAtPerformance.current,
      );
      const response: ResponseRecord = {
        id: newId(),
        drillType: question.drillType,
        questionText: question.questionText,
        operands: question.operands,
        correctAnswer: question.correctAnswer,
        correctAnswerText: question.correctAnswerText,
        submittedAnswer: Number(submitted),
        submittedAnswerText: submitted,
        metadata: question.metadata,
        isCorrect: result.outcome === 'correct',
        responseTimeMs,
        isSlow: isSlowResponse(responseTimeMs, current.slowThresholdMs),
        answeredAt: new Date().toISOString(),
      };
      const counts = { ...current.mixedCounts };
      counts[question.drillType] += 1;
      const recorded = {
        ...current,
        responses: [...current.responses, response],
        mixedCounts: counts,
      };
      onChange(recorded);
      setAnswer('');
      setRetryMessage('');

      if (!response.isCorrect) {
        playWrong();
        setFeedback({
          correct: response.correctAnswerText ?? String(response.correctAnswer),
        });
        feedbackTimer.current = setTimeout(() => {
          const latest = sessionRef.current;
          if (
            latest.trainingMode === 'free' ||
            Date.now() < latest.deadlineEpochMs
          )
            onChange(advanceQuestion(latest));
          setFeedback(null);
          locked.current = false;
        }, 420);
      } else {
        onChange(advanceQuestion(recorded));
        locked.current = false;
      }
    },
    [advanceQuestion, attemptsUsed, onChange, playWrong],
  );

  const scheduleAutoSubmit = useCallback(
    (nextAnswer: string) => {
      const current = sessionRef.current;
      autoSubmit.current?.schedule(
        nextAnswer,
        current.currentQuestion.id,
        ({ value, questionId, submittedAtMs }) =>
          attemptAnswer(value, questionId, submittedAtMs),
      );
    },
    [attemptAnswer],
  );

  useEffect(
    () => () => {
      autoSubmit.current?.cancel();
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const drill = session.currentQuestion.drillType;
  const effectiveNow = session.pausedAtEpochMs ?? now;
  const remaining =
    session.trainingMode === 'free'
      ? activeElapsedMs(session, now)
      : session.trainingMode === 'focused'
        ? Math.max(0, session.segmentDeadlineEpochMs - effectiveNow)
        : Math.max(0, session.deadlineEpochMs - effectiveNow);
  const elapsed = activeElapsedMs(session, now);
  const drillQuestionNumber =
    session.responses.filter((response) => response.drillType === drill)
      .length + 1;

  return (
    <div className="session-screen">
      <header className="session-topbar">
        <span className="session-brand">Nimble</span>
        <div className="session-heading">
          <span>
            {session.trainingMode === 'focused'
              ? 'Focused'
              : session.trainingMode === 'mixed'
                ? 'Mixed'
                : session.trainingMode === 'custom'
                  ? 'Custom 10-Min'
                  : 'Free'}{' '}
            practice
          </span>
          <div className="session-controls">
            <button
              onClick={
                session.pausedAtEpochMs === undefined
                  ? pauseSession
                  : resumeSession
              }
              disabled={Boolean(feedback)}
            >
              {session.pausedAtEpochMs === undefined ? (
                <>
                  <Pause /> Pause
                </>
              ) : (
                <>
                  <Play /> Resume
                </>
              )}
            </button>
            <button onClick={requestStop} disabled={Boolean(feedback)}>
              <Square />{' '}
              {session.trainingMode === 'free' ? 'Finish session' : 'Stop'}
            </button>
          </div>
        </div>
      </header>
      {session.trainingMode !== 'free' && (
        <div
          className="overall-track"
          aria-label={`${Math.round((elapsed / SESSION_DURATION_MS) * 100)}% complete`}
        >
          <span
            style={{ width: `${(elapsed / SESSION_DURATION_MS) * 100}%` }}
          />
        </div>
      )}
      {(session.pausedAtEpochMs !== undefined || stopPrompt) && (
        <div
          className="session-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-dialog-title"
        >
          <div className="session-dialog">
            {stopPrompt ? (
              <>
                <p className="eyebrow">End practice</p>
                <h2 id="session-dialog-title">
                  {session.trainingMode === 'free'
                    ? 'Finish this practice session?'
                    : 'Stop this session?'}
                </h2>
                <p>
                  {session.trainingMode === 'free'
                    ? 'Completed responses will be saved and your report will open.'
                    : 'Your unfinished responses will not be saved to history.'}
                </p>
                <div className="session-dialog-actions">
                  <button
                    className="session-dialog-secondary"
                    onClick={cancelStop}
                  >
                    Keep practicing
                  </button>
                  <Button
                    className="session-dialog-primary"
                    onClick={
                      session.trainingMode === 'free'
                        ? finishFreeSession
                        : onStop
                    }
                  >
                    {session.trainingMode === 'free'
                      ? 'Finish'
                      : 'Stop session'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">Practice paused</p>
                <h2 id="session-dialog-title">Take your time.</h2>
                <p>Active practice will continue when you resume.</p>
                <Button
                  className="session-dialog-primary"
                  onClick={resumeSession}
                >
                  Resume <Play />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <main className="practice-stage">
        {recovered && (
          <div className="recovery-note">
            <Check /> Session restored
          </div>
        )}
        <div className="practice-meta">
          <span>{DRILL_LABELS[drill]}</span>
          <span>Question {drillQuestionNumber}</span>
        </div>
        <div className="question" aria-live="polite">
          {session.currentQuestion.questionText}
        </div>
        <div className="answer-form">
          <label htmlFor="answer" className="sr-only">
            Answer
          </label>
          <Input
            ref={inputRef}
            id="answer"
            value={answer}
            onChange={(event) => {
              const nextAnswer = sanitizeDecimalInput(event.target.value).slice(
                0,
                12,
              );
              setRetryMessage('');
              setAnswer(nextAnswer);
              scheduleAutoSubmit(nextAnswer);
            }}
            disabled={
              Boolean(feedback) ||
              Boolean(stopPrompt) ||
              session.pausedAtEpochMs !== undefined
            }
            inputMode="decimal"
            pattern="[0-9]*[.]?[0-9]*"
            autoComplete="off"
            maxLength={12}
            className="answer-input"
            aria-describedby="answer-hint"
          />
        </div>
        <div id="answer-hint" className="answer-hint" aria-live="assertive">
          {feedback ? (
            <span className="incorrect-feedback">
              <X /> Incorrect. <strong>{feedback.correct}</strong>
            </span>
          ) : retryMessage ? (
            <span className="incorrect-feedback">
              <X /> {retryMessage}
            </span>
          ) : (
            <span>
              Answers submit automatically · {MAX_ANSWER_ATTEMPTS} tries
            </span>
          )}
        </div>
        <div className="timer-block">
          <span>
            {session.trainingMode === 'free'
              ? 'Elapsed time'
              : 'Time remaining'}
          </span>
          <strong>{formatClock(remaining)}</strong>
        </div>
      </main>
    </div>
  );
}

function HistoryScreen({
  items,
  error,
  onBack,
  onSelect,
}: {
  items: HistoryItem[];
  error: string;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Shell compact onNavigate={() => undefined}>
      <main className="page-standard">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft /> Home
        </button>
        <p className="eyebrow">Archive</p>
        <h1>History</h1>
        <p className="page-lede">
          Every completed Nimble session, newest first.
        </p>
        {error && !items.length ? (
          <p className="muted-message">{error}</p>
        ) : (
          <div className="history-list">
            {items.map((item) => (
              <button
                key={item.id}
                className="history-row"
                onClick={() => onSelect(item.id)}
              >
                <div>
                  <strong>{formatDate(item.completedAt, true)}</strong>
                  <span>{modeLabel(item.trainingMode)}</span>
                  {item.trainingMode === 'custom' && (
                    <span>
                      {item.enabledDrills
                        .map((drill) => DRILL_LABELS[drill])
                        .join(', ')}
                    </span>
                  )}
                </div>
                <div className="history-metrics">
                  <span>
                    <strong>{percent(item.accuracy)}</strong> accuracy
                  </span>
                  <span>
                    <strong>{formatSeconds(item.averageResponseTimeMs)}</strong>{' '}
                    average
                  </span>
                  <span>
                    <strong>{item.slowCount}</strong> slow
                  </span>
                  <span>
                    <strong>{item.incorrectCount}</strong> mistakes
                  </span>
                </div>
                <ArrowRight />
              </button>
            ))}
            {!items.length && (
              <div className="empty-state">
                <span>00</span>
                <p>No completed sessions yet.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </Shell>
  );
}

function SettingsScreen({
  settings,
  onChange,
  onBack,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onBack: () => void;
}) {
  return (
    <Shell compact onNavigate={() => undefined}>
      <main className="page-narrow settings-page">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft /> Home
        </button>
        <p className="eyebrow">Preferences</p>
        <h1>Settings</h1>
        <p className="page-lede">Keep the instrument tuned to your practice.</p>
        <section className="settings-card">
          <div>
            <label htmlFor="threshold">Slow-answer threshold</label>
            <p>A response is slow only when it exceeds this value.</p>
          </div>
          <div className="number-control">
            <Input
              id="threshold"
              type="number"
              min="1"
              max="30"
              step="0.1"
              value={settings.slowThresholdSeconds}
              onChange={(event) =>
                onChange({
                  ...settings,
                  slowThresholdSeconds: Math.min(
                    30,
                    Math.max(1, Number(event.target.value) || 5),
                  ),
                })
              }
            />
            <span>seconds</span>
          </div>
        </section>
        <section className="settings-card">
          <div>
            <label htmlFor="sound">Sound feedback</label>
            <p>A brief low tone after an incorrect response.</p>
          </div>
          <Switch
            id="sound"
            checked={settings.sound}
            onCheckedChange={(sound) => onChange({ ...settings, sound })}
          />
        </section>
        <section className="settings-card appearance-card">
          <div>
            <label>Appearance</label>
            <p>Choose how Nimble looks on this device.</p>
          </div>
          <div className="segmented">
            {(['light', 'dark', 'system'] as const).map((appearance) => (
              <button
                key={appearance}
                className={settings.appearance === appearance ? 'active' : ''}
                onClick={() => onChange({ ...settings, appearance })}
              >
                {appearance}
              </button>
            ))}
          </div>
        </section>
        <p className="fixed-note">
          Practice length is always 10 minutes. Focused mode divides the time
          equally across selected drills; Mixed mode uses one continuous block.
        </p>
      </main>
    </Shell>
  );
}

function ReportScreen({
  report,
  saveWarning,
  onBack,
}: {
  report: Report;
  saveWarning: string;
  onBack: () => void;
}) {
  return (
    <Shell compact onNavigate={() => undefined}>
      <main className="report-page page-standard">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft /> Home
        </button>
        <header className="report-header">
          <div>
            <p className="eyebrow">Daily report</p>
            <h1>Nimble</h1>
            <p>{formatDate(report.session.completedAt, true)}</p>
          </div>
          <div className="mode-pill">
            Practice Style:{' '}
            <strong className="capitalize">
              {modeLabel(report.session.trainingMode)}
            </strong>
            <br />
            Practice Areas:{' '}
            <strong>
              {report.session.enabledDrills
                .map((drill) => DRILL_LABELS[drill])
                .join(', ')}
            </strong>
          </div>
        </header>
        {saveWarning && <div className="save-warning">{saveWarning}</div>}
        <section className="overall-stats" aria-label="Overall statistics">
          <Stat value={String(report.totalQuestions)} label="Questions" />
          {report.session.trainingMode === 'free' && (
            <Stat
              value={formatClock(report.session.durationMs)}
              label="Duration"
            />
          )}
          <Stat
            value={percent(report.accuracy)}
            label={`${report.correctCount} correct · ${report.incorrectCount} incorrect`}
          />
          <Stat
            value={formatSeconds(report.averageResponseTimeMs)}
            label="Average time"
          />
          <Stat
            value={formatSeconds(report.medianResponseTimeMs)}
            label="Median time"
          />
          <Stat
            value={String(report.slowCount)}
            label={`Over ${report.session.slowThresholdMs / 1000}s`}
          />
        </section>
        <section className="breakdown">
          <div className="section-heading">
            <div>
              <p className="eyebrow">By skill</p>
              <h2>Drill breakdown</h2>
            </div>
          </div>
          <div className="drill-grid">
            {report.drillStats
              .filter((stats) =>
                report.session.enabledDrills.includes(stats.drillType),
              )
              .map((stats) => (
                <article className="drill-card" key={stats.drillType}>
                  <h3>{DRILL_LABELS[stats.drillType]}</h3>
                  <div className="accuracy-line">
                    <strong>{percent(stats.accuracy)}</strong>
                    <span>{stats.questions} questions</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Correct</dt>
                      <dd>{stats.correct}</dd>
                    </div>
                    <div>
                      <dt>Average</dt>
                      <dd>{formatSeconds(stats.averageResponseTimeMs)}</dd>
                    </div>
                    <div>
                      <dt>Slow</dt>
                      <dd>{stats.slow}</dd>
                    </div>
                    <div>
                      <dt>Mistakes</dt>
                      <dd>{stats.incorrect}</dd>
                    </div>
                  </dl>
                </article>
              ))}
          </div>
        </section>
        {report.quickTips.length > 0 && (
          <section className="needs-practice">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Coaching</p>
                <h2>Quick Tips</h2>
              </div>
            </div>
            <div className="practice-list">
              {report.quickTips.map((tip) => (
                <article key={tip.id} className="practice-row">
                  <div className="practice-question">
                    <strong>{tip.title}</strong>
                    <span>{tip.strategy}</span>
                    {tip.example && <span>{tip.example}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {report.recurringPatterns.length > 0 && (
          <section className="needs-practice">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Across sessions</p>
                <h2>Recurring Patterns</h2>
              </div>
            </div>
            <div className="practice-list">
              {report.recurringPatterns.map((tip) => (
                <article key={tip.id} className="practice-row">
                  <div className="practice-question">
                    <strong>{tip.title}</strong>
                    <span>{tip.strategy}</span>
                    {tip.example && <span>{tip.example}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        <section className="needs-practice">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Review</p>
              <h2>Needs Practice</h2>
            </div>
            <span>{report.needsPractice.length} flagged</span>
          </div>
          {report.needsPractice.length ? (
            <div className="practice-list">
              {report.needsPractice.map((response) => (
                <article key={response.id} className="practice-row">
                  <div className="practice-question">
                    <span>{DRILL_LABELS[response.drillType]}</span>
                    <strong>{response.questionText.replace(' = ?', '')}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>My answer</dt>
                      <dd>
                        {response.submittedAnswerText ??
                          response.submittedAnswer}
                      </dd>
                    </div>
                    <div>
                      <dt>Correct</dt>
                      <dd>
                        {response.correctAnswerText ?? response.correctAnswer}
                      </dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{formatSeconds(response.responseTimeMs)}</dd>
                    </div>
                    <div>
                      <dt>Reason</dt>
                      <dd className="reason">
                        {classifyPracticeReason(response)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="all-clear">
              <Check /> Nothing flagged. Every answer was correct and within the
              threshold.
            </div>
          )}
        </section>
      </main>
    </Shell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
