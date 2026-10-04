const DECIMAL_INPUT = /^\+?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function normalizeDecimal(value: string): string | null {
  const trimmed = value.trim();
  if (!DECIMAL_INPUT.test(trimmed)) return null;
  const unsigned = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const [rawInteger = '0', rawFraction = ''] = unsigned.split('.');
  const integer = (rawInteger || '0').replace(/^0+(?=\d)/, '') || '0';
  const fraction = rawFraction.replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
}

export function shiftDecimal(value: string, places: number): string {
  const normalized = normalizeDecimal(value);
  if (normalized === null) throw new Error('Invalid decimal value');
  const [integer, fraction = ''] = normalized.split('.');
  const digits = `${integer}${fraction}`;
  const decimalIndex = integer.length + places;
  let shifted: string;
  if (decimalIndex <= 0) {
    shifted = `0.${'0'.repeat(-decimalIndex)}${digits}`;
  } else if (decimalIndex >= digits.length) {
    shifted = `${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  } else {
    shifted = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  }
  const result = normalizeDecimal(shifted);
  if (result === null) throw new Error('Could not normalize shifted decimal');
  return result;
}

export function decimalPlacesForFactor(factor: number): number | null {
  if (factor === 10) return 1;
  if (factor === 100) return 2;
  if (factor === 1000) return 3;
  return null;
}

export function calculateDecimalAnswer(
  value: string,
  factor: number,
  operation: 'division' | 'multiplication',
): string {
  const places = decimalPlacesForFactor(factor);
  if (places === null || normalizeDecimal(value) === null)
    throw new Error('Invalid decimal calculation');
  return shiftDecimal(value, operation === 'division' ? -places : places);
}

export function decimalAnswersEqual(
  submitted: string,
  correct: string,
): boolean {
  const left = normalizeDecimal(submitted);
  const right = normalizeDecimal(correct);
  return left !== null && right !== null && left === right;
}

export function sanitizeDecimalInput(value: string, maxLength = 12): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const decimalIndex = cleaned.indexOf('.');
  const singleDecimal =
    decimalIndex === -1
      ? cleaned
      : `${cleaned.slice(0, decimalIndex + 1)}${cleaned.slice(decimalIndex + 1).replace(/\./g, '')}`;
  return singleDecimal.slice(0, maxLength);
}

export function decimalToNumber(value: string): number {
  const normalized = normalizeDecimal(value);
  if (normalized === null) throw new Error('Invalid decimal value');
  return Number(normalized);
}
