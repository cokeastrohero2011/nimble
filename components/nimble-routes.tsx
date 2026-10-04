'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  History as HistoryIcon,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  DRILL_LABELS,
  type HistoryItem,
  type Report,
  type Settings,
  type TrainingMode,
} from '@/lib/nimble-types';
import { loadSettings, saveSettings } from '@/lib/local-state';
import { classifyPracticeReason } from '@/lib/report';

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} sec`;
const formatDate = (date: string, long = false) =>
  new Intl.DateTimeFormat(
    undefined,
    long
      ? { month: 'long', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  ).format(new Date(date));
const percent = (value: number) => `${Math.round(value)}%`;
const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return (
    String(Math.floor(total / 60)) +
    'm ' +
    String(total % 60).padStart(2, '0') +
    's'
  );
};
const modeLabel = (mode: TrainingMode) =>
  mode === 'custom'
    ? 'Custom 10-Min'
    : mode === 'free'
      ? 'Free Practice'
      : mode === 'focused'
        ? 'Focused'
        : 'Mixed';

function RouteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell compact">
      <header className="topbar">
        <a className="wordmark" href="/">
          Nimble
        </a>
        <nav aria-label="Primary navigation">
          <a href="/history">
            <HistoryIcon /> History
          </a>
          <a href="/settings">
            <SettingsIcon /> Settings
          </a>
        </nav>
      </header>
      {children}
    </div>
  );
}

export function HistoryRoute() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/sessions')
      .then(async (response) => {
        if (!response.ok) throw new Error('History request failed');
        return response.json() as Promise<{ sessions: HistoryItem[] }>;
      })
      .then((data) => {
        if (active) setItems(data.sessions);
      })
      .catch(() => {
        if (active) setError('History is temporarily unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <RouteShell>
      <main className="page-standard">
        <a className="back-link" href="/">
          <ArrowLeft /> Home
        </a>
        <p className="eyebrow">Archive</p>
        <h1>History</h1>
        <p className="page-lede">
          Every completed Nimble session, newest first.
        </p>
        {loading ? (
          <p className="muted-message">Loading history…</p>
        ) : error ? (
          <p className="muted-message">{error}</p>
        ) : (
          <div className="history-list">
            {items.map((item) => (
              <a
                key={item.id}
                className="history-row"
                href={`/report/${encodeURIComponent(item.id)}`}
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
                  {item.trainingMode === 'free' && (
                    <span>{formatClock(item.durationMs)}</span>
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
              </a>
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
    </RouteShell>
  );
}

export function SettingsRoute() {
  const [settings, setSettingsState] = useState<Settings>({
    slowThresholdSeconds: 5,
    sound: false,
    appearance: 'system',
  });

  useEffect(() => {
    setSettingsState(loadSettings(localStorage));
  }, []);
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
  const update = (next: Settings) => {
    setSettingsState(next);
    saveSettings(localStorage, next);
  };

  return (
    <RouteShell>
      <main className="page-narrow settings-page">
        <a className="back-link" href="/">
          <ArrowLeft /> Home
        </a>
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
                update({
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
            onCheckedChange={(sound) => update({ ...settings, sound })}
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
                onClick={() => update({ ...settings, appearance })}
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
    </RouteShell>
  );
}

export function ReportRoute({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/sessions/${encodeURIComponent(id)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Report request failed');
        return response.json() as Promise<{ report: Report }>;
      })
      .then((data) => {
        if (active) setReport(data.report);
      })
      .catch(() => {
        if (active) setError('This Nimble report could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (error)
    return (
      <RouteShell>
        <main className="page-standard">
          <a className="back-link" href="/history">
            <ArrowLeft /> History
          </a>
          <p className="muted-message">{error}</p>
        </main>
      </RouteShell>
    );
  if (!report)
    return (
      <RouteShell>
        <main className="page-standard">
          <p className="muted-message">Loading report…</p>
        </main>
      </RouteShell>
    );

  return (
    <RouteShell>
      <main className="report-page page-standard">
        <a className="back-link" href="/history">
          <ArrowLeft /> History
        </a>
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
    </RouteShell>
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
