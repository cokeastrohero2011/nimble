import { describe, expect, it } from 'vitest';
import {
  chooseMixedDrill,
  emptyDrillCounts,
  generateQuestion,
  questionUsesOne,
} from '../lib/questions';
import { DRILL_TYPES, type DrillType } from '../lib/nimble-types';
import {
  calculateDecimalAnswer,
  decimalAnswersEqual,
  shiftDecimal,
} from '../lib/decimal';

function lcg(seed = 42) {
  let state = seed >>> 0;
  return () => (state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32;
}

describe('question generation', () => {
  it.each(DRILL_TYPES)(
    'generates valid %s questions without consecutive duplicates or operands of one',
    (drill) => {
      const rng = lcg();
      let previous: string | undefined;
      for (let index = 0; index < 300; index++) {
        const question = generateQuestion(drill, rng, previous);
        const { a, b, factor } = question.operands;
        expect(question.key).not.toBe(previous);
        expect(questionUsesOne(question)).toBe(false);
        if (drill === 'addition' || drill === 'multiplication') {
          expect(a).toBeGreaterThanOrEqual(2);
          expect(a).toBeLessThanOrEqual(9);
          expect(b).toBeGreaterThanOrEqual(2);
          expect(b).toBeLessThanOrEqual(9);
        }
        if (drill === 'addition') expect(question.correctAnswer).toBe(a + b);
        if (drill === 'multiplication')
          expect(question.correctAnswer).toBe(a * b);
        if (drill === 'subtraction') {
          expect(a).toBeLessThanOrEqual(9);
          expect(b).toBeLessThanOrEqual(9);
          expect(question.correctAnswer).toBeGreaterThanOrEqual(0);
        }
        if (drill === 'bonds10') expect(a + question.correctAnswer).toBe(10);
        if (drill === 'bonds100') expect(a + question.correctAnswer).toBe(100);
        if (drill === 'decimalDivision' || drill === 'decimalMultiplication') {
          expect([10, 100, 1000]).toContain(factor);
          expect(question.correctAnswerText).toBe(
            calculateDecimalAnswer(
              question.operands.decimalValue!,
              factor!,
              drill === 'decimalDivision' ? 'division' : 'multiplication',
            ),
          );
        }
        previous = question.key;
      }
    },
  );

  it('handles decimal shifting and equivalent answer formats exactly', () => {
    expect(shiftDecimal('5.4', -2)).toBe('0.054');
    expect(shiftDecimal('72', -3)).toBe('0.072');
    expect(shiftDecimal('0.047', 3)).toBe('47');
    expect(calculateDecimalAnswer('12.75', 100, 'multiplication')).toBe('1275');
    expect(decimalAnswersEqual('0.50', '0.5')).toBe(true);
    expect(decimalAnswersEqual('0.30000000000000004', '0.3')).toBe(false);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])(
    'balances mixed selection with %i enabled drills',
    (count) => {
      const enabled = DRILL_TYPES.slice(0, count);
      const counts = emptyDrillCounts();
      const sequence: DrillType[] = [];
      const rng = lcg(9 + count);
      for (let index = 0; index < 350; index++) {
        const drill = chooseMixedDrill(counts, sequence, rng, enabled);
        counts[drill] += 1;
        sequence.push(drill);
      }
      expect(new Set(sequence)).toEqual(new Set(enabled));
      expect(sequence.every((drill) => enabled.includes(drill))).toBe(true);
      const activeCounts = enabled.map((drill) => counts[drill]);
      expect(
        Math.max(...activeCounts) - Math.min(...activeCounts),
      ).toBeLessThanOrEqual(2);
      if (count > 1)
        for (let index = 2; index < sequence.length; index++) {
          expect(
            sequence[index] === sequence[index - 1] &&
              sequence[index] === sequence[index - 2],
          ).toBe(false);
        }
      if (count > 2) {
        const cycle = Array.from(
          { length: 28 },
          (_, index) => enabled[index % enabled.length],
        );
        expect(sequence.slice(0, 28)).not.toEqual(cycle);
      }
    },
  );
});
