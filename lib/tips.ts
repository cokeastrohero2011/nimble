import type {
  CoachingTip,
  HistoricalResponse,
  ResponseRecord,
} from './nimble-types';

const problematic = (response: ResponseRecord) =>
  !response.isCorrect || response.isSlow;
type Pattern = {
  id: string;
  title: string;
  strategy: string;
  example?: string;
  matches: (response: ResponseRecord) => boolean;
};

const decimalPattern = (
  operation: 'division' | 'multiplication',
  factor: 10 | 100 | 1000,
): Pattern => {
  const places = Math.log10(factor);
  const symbol = operation === 'division' ? '÷' : '×';
  const direction = operation === 'division' ? 'left' : 'right';
  const example =
    operation === 'division'
      ? `6.4 ÷ ${factor} = ${factor === 10 ? '0.64' : factor === 100 ? '0.064' : '0.0064'}`
      : `0.47 × ${factor} = ${factor === 10 ? '4.7' : factor === 100 ? '47' : '470'}`;
  return {
    id: `decimal-${operation}-${factor}`,
    title: `${symbol}${factor} place value`,
    strategy: `Shift the decimal point ${places} place${places === 1 ? '' : 's'} ${direction}; add placeholder zeros when needed.`,
    example,
    matches: (row) =>
      row.metadata?.decimalOperation === operation &&
      row.metadata?.decimalFactor === factor,
  };
};

const PATTERNS: Pattern[] = [
  ...([10, 100, 1000] as const).flatMap((factor) => [
    decimalPattern('division', factor),
    decimalPattern('multiplication', factor),
  ]),
  {
    id: 'times-nine',
    title: 'Multiplying by 9',
    strategy: 'Multiply by 10, then subtract one group.',
    example: '9 × 7 = 70 − 7 = 63',
    matches: (row) =>
      row.metadata?.strategyTags.includes('times-nine') ?? false,
  },
];
const toTip = ({ id, title, strategy, example }: Pattern): CoachingTip => ({
  id,
  title,
  strategy,
  example,
});

export function generateQuickTips(responses: ResponseRecord[]): CoachingTip[] {
  return PATTERNS.filter((pattern) => {
    const matching = responses.filter(pattern.matches);
    const weak = matching.filter(problematic);
    return (
      matching.length >= 2 &&
      weak.length >= 2 &&
      weak.length / matching.length >= 0.4
    );
  })
    .slice(0, 3)
    .map(toTip);
}

export function generateRecurringPatterns(
  responses: HistoricalResponse[],
): CoachingTip[] {
  return PATTERNS.filter((pattern) => {
    const weak = responses.filter(
      (row) => pattern.matches(row) && problematic(row),
    );
    return (
      weak.length >= 3 && new Set(weak.map((row) => row.sessionId)).size >= 2
    );
  })
    .slice(0, 2)
    .map((pattern) => ({
      ...toTip(pattern),
      id: `recurring-${pattern.id}`,
      title: `${pattern.title} remains a pattern`,
    }));
}
