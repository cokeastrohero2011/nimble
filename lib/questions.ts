import {
  DRILL_TYPES,
  type DecimalFactor,
  type DrillType,
  type Operands,
  type Question,
  type QuestionMetadata,
} from './nimble-types';
import {
  calculateDecimalAnswer,
  decimalToNumber,
  normalizeDecimal,
} from './decimal';

export type RandomSource = () => number;
const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const pick = <T>(items: readonly T[], rng: RandomSource): T =>
  items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

function metadataFor(
  drillType: DrillType,
  operands: Operands,
): QuestionMetadata {
  const metadata: QuestionMetadata = { strategyTags: [] };
  if (drillType === 'multiplication' && (operands.a === 9 || operands.b === 9))
    metadata.strategyTags.push('times-nine');
  if (
    drillType === 'decimalDivision' ||
    drillType === 'decimalMultiplication'
  ) {
    metadata.decimalOperation =
      drillType === 'decimalDivision' ? 'division' : 'multiplication';
    metadata.decimalFactor = operands.factor;
    metadata.strategyTags.push(`decimal-${metadata.decimalOperation}`);
  }
  return metadata;
}

export function reconstructQuestion(
  drillType: DrillType,
  operands: Operands,
): Omit<Question, 'id'> {
  const { a, b, missingSide } = operands;
  let questionText: string;
  let correctAnswerText: string;
  if (drillType === 'addition') {
    questionText = `${a} + ${b} = ?`;
    correctAnswerText = String(a + b);
  } else if (drillType === 'multiplication') {
    questionText = `${a} × ${b} = ?`;
    correctAnswerText = String(a * b);
  } else if (drillType === 'subtraction') {
    questionText = `${a} − ${b} = ?`;
    correctAnswerText = String(a - b);
  } else if (drillType === 'bonds10' || drillType === 'bonds100') {
    const total = drillType === 'bonds10' ? 10 : 100;
    questionText =
      missingSide === 'left' ? `? + ${a} = ${total}` : `${a} + ? = ${total}`;
    correctAnswerText = String(b);
  } else {
    const value = normalizeDecimal(operands.decimalValue ?? String(a));
    const factor = operands.factor;
    if (!value || !factor || ![10, 100, 1000].includes(factor))
      throw new Error('Invalid decimal operands');
    const operation =
      drillType === 'decimalDivision' ? 'division' : 'multiplication';
    questionText = `${value} ${operation === 'division' ? '÷' : '×'} ${factor} = ?`;
    correctAnswerText = calculateDecimalAnswer(value, factor, operation);
  }
  const answer = normalizeDecimal(correctAnswerText) ?? correctAnswerText;
  return {
    drillType,
    questionText,
    operands,
    correctAnswer: decimalToNumber(answer),
    correctAnswerText: answer,
    metadata: metadataFor(drillType, operands),
    key: `${drillType}:${a}:${b}:${missingSide ?? ''}:${operands.decimalValue ?? ''}:${operands.factor ?? ''}`,
  };
}

export function expectedAnswer(
  drillType: DrillType,
  a: number,
  b: number,
): number {
  if (drillType === 'addition') return a + b;
  if (drillType === 'multiplication') return a * b;
  if (drillType === 'subtraction') return a - b;
  return b;
}

const build = (drillType: DrillType, operands: Operands): Question => ({
  id: id(),
  ...reconstructQuestion(drillType, operands),
});
const DECIMAL_FACTORS = [10, 100, 1000] as const;
const DECIMAL_VALUES = [
  '0.04',
  '0.047',
  '0.08',
  '0.125',
  '0.37',
  '0.428',
  '0.47',
  '0.625',
  '0.8',
  '0.84',
  '1.25',
  '2.04',
  '3.65',
  '4.7',
  '5.4',
  '6.2',
  '8.06',
  '12.75',
  '24.08',
  '36.5',
  '72',
  '81.04',
  '125.6',
  '307.5',
  '728.4',
] as const;

function decimalQuestion(
  drillType: 'decimalDivision' | 'decimalMultiplication',
  rng: RandomSource,
): Question {
  const decimalValue = pick(DECIMAL_VALUES, rng);
  const factor = pick(DECIMAL_FACTORS, rng) as DecimalFactor;
  return build(drillType, {
    a: Number(decimalValue),
    b: factor,
    decimalValue,
    factor,
  });
}

export function generateQuestion(
  drillType: DrillType,
  rng: RandomSource = Math.random,
  previousKey?: string,
  exposure: Record<string, number> = {},
): Question {
  if (
    drillType === 'decimalDivision' ||
    drillType === 'decimalMultiplication'
  ) {
    let result = decimalQuestion(drillType, rng);
    for (let attempt = 0; attempt < 5 && result.key === previousKey; attempt++)
      result = decimalQuestion(drillType, rng);
    return result;
  }
  const candidates: Question[] = [];
  if (drillType === 'addition') {
    for (let a = 2; a <= 9; a++)
      for (let b = 2; b <= 9; b++) candidates.push(build(drillType, { a, b }));
  } else if (drillType === 'multiplication') {
    for (let a = 2; a <= 9; a++)
      for (let b = 2; b <= 9; b++) candidates.push(build(drillType, { a, b }));
  } else if (drillType === 'subtraction') {
    for (let a = 2; a <= 9; a++)
      for (let b = 2; b <= a; b++) candidates.push(build(drillType, { a, b }));
  } else if (drillType === 'bonds10') {
    for (let a = 2; a <= 8; a++) {
      candidates.push(build(drillType, { a, b: 10 - a, missingSide: 'left' }));
      candidates.push(build(drillType, { a, b: 10 - a, missingSide: 'right' }));
    }
  } else if (drillType === 'bonds100') {
    for (let a = 2; a <= 98; a++) {
      candidates.push(build(drillType, { a, b: 100 - a, missingSide: 'left' }));
      candidates.push(
        build(drillType, { a, b: 100 - a, missingSide: 'right' }),
      );
    }
  }
  let pool = candidates.filter((question) => question.key !== previousKey);
  if (drillType === 'multiplication') {
    const minimum = Math.min(
      ...pool.map((question) => exposure[question.key] ?? 0),
    );
    pool = pool.filter(
      (question) => (exposure[question.key] ?? 0) <= minimum + 1,
    );
  }
  if (drillType === 'bonds100') {
    const nonRound = pool.filter((question) => question.operands.a % 10 !== 0);
    if (nonRound.length && rng() < 0.82) pool = nonRound;
  }
  return pick(pool, rng);
}

export function questionUsesOne(question: Pick<Question, 'operands'>): boolean {
  const value = question.operands.decimalValue;
  return (
    question.operands.a === 1 ||
    question.operands.b === 1 ||
    (value !== undefined && normalizeDecimal(value) === '1')
  );
}

export function chooseMixedDrill(
  counts: Record<DrillType, number>,
  recent: DrillType[],
  rng: RandomSource = Math.random,
  enabledDrills: readonly DrillType[] = DRILL_TYPES,
): DrillType {
  if (!enabledDrills.length)
    throw new Error('At least one drill must be enabled');
  const lastTwo = recent.slice(-2);
  const blocked =
    lastTwo.length === 2 && lastTwo[0] === lastTwo[1] ? lastTwo[0] : undefined;
  const available = enabledDrills.filter((drill) => drill !== blocked);
  const usable = available.length ? available : [...enabledDrills];
  const minimum = Math.min(...usable.map((drill) => counts[drill] ?? 0));
  return pick(
    usable.filter((drill) => (counts[drill] ?? 0) <= minimum + 1),
    rng,
  );
}

export function emptyDrillCounts(): Record<DrillType, number> {
  return Object.fromEntries(DRILL_TYPES.map((drill) => [drill, 0])) as Record<
    DrillType,
    number
  >;
}
