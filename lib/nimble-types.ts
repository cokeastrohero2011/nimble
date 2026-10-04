export const DRILL_TYPES = [
  'addition',
  'multiplication',
  'subtraction',
  'bonds10',
  'bonds100',
  'decimalDivision',
  'decimalMultiplication',
] as const;

export type DrillType = (typeof DRILL_TYPES)[number];
export type TrainingMode = 'focused' | 'mixed' | 'custom' | 'free';
export type Appearance = 'light' | 'dark' | 'system';
export type DecimalFactor = 10 | 100 | 1000;

export const CORE_DRILLS: readonly DrillType[] = [
  'addition',
  'multiplication',
  'subtraction',
  'bonds10',
  'bonds100',
];
export const DECIMAL_DRILLS: readonly DrillType[] = [
  'decimalDivision',
  'decimalMultiplication',
];

export const DRILL_LABELS: Record<DrillType, string> = {
  addition: 'Addition',
  multiplication: 'Multiplication',
  subtraction: 'Subtraction',
  bonds10: 'Bonds to 10',
  bonds100: 'Bonds to 100',
  decimalDivision: 'Decimal Division',
  decimalMultiplication: 'Decimal Multiplication',
};

export type Operands = {
  a: number;
  b: number;
  missingSide?: 'left' | 'right';
  decimalValue?: string;
  factor?: DecimalFactor;
};

export type QuestionMetadata = {
  decimalOperation?: 'division' | 'multiplication';
  decimalFactor?: DecimalFactor;
  strategyTags: string[];
};

export type Question = {
  id: string;
  drillType: DrillType;
  questionText: string;
  operands: Operands;
  correctAnswer: number;
  correctAnswerText: string;
  metadata: QuestionMetadata;
  key: string;
};

export type ResponseRecord = {
  id: string;
  drillType: DrillType;
  questionText: string;
  operands: Operands;
  correctAnswer: number;
  correctAnswerText?: string;
  submittedAnswer: number;
  submittedAnswerText?: string;
  metadata?: QuestionMetadata;
  isCorrect: boolean;
  responseTimeMs: number;
  isSlow: boolean;
  answeredAt: string;
};

export type SessionPayload = {
  id: string;
  trainingMode: TrainingMode;
  enabledDrills: DrillType[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  slowThresholdMs: number;
  responses: ResponseRecord[];
};

export type DrillStats = {
  drillType: DrillType;
  questions: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  averageResponseTimeMs: number;
  medianResponseTimeMs: number;
  slow: number;
};

export type CoachingTip = {
  id: string;
  title: string;
  strategy: string;
  example?: string;
};
export type HistoricalResponse = ResponseRecord & { sessionId: string };

export type Report = {
  session: SessionPayload;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  averageResponseTimeMs: number;
  medianResponseTimeMs: number;
  slowCount: number;
  drillStats: DrillStats[];
  needsPractice: ResponseRecord[];
  quickTips: CoachingTip[];
  recurringPatterns: CoachingTip[];
};

export type HistoryItem = {
  id: string;
  trainingMode: TrainingMode;
  enabledDrills: DrillType[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  slowCount: number;
  accuracy: number;
  averageResponseTimeMs: number;
};

export type ActiveSession = {
  version: 3;
  id: string;
  trainingMode: TrainingMode;
  enabledDrills: DrillType[];
  focusedDurationsMs: number[];
  startedAt: string;
  startedAtEpochMs: number;
  deadlineEpochMs: number;
  pausedAtEpochMs?: number;
  pausedDurationMs: number;
  currentDrillIndex: number;
  segmentDeadlineEpochMs: number;
  currentQuestion: Question;
  questionShownAtEpochMs: number;
  responses: ResponseRecord[];
  mixedCounts: Record<DrillType, number>;
  recentDrills: DrillType[];
  slowThresholdMs: number;
};

export type OnboardingPreferences = {
  trainingMode: TrainingMode;
  enabledDrills: DrillType[];
  customDrills: DrillType[];
  freeDrills: DrillType[];
};
export type Settings = {
  slowThresholdSeconds: number;
  sound: boolean;
  appearance: Appearance;
};
