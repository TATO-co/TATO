import { describe, expect, it } from 'vitest';

import { readTrimmedString, readTrimmedStringArray } from '@/lib/liveIntake/normalize';

describe('live intake runtime normalization', () => {
  it('returns a trimmed string for valid string input', () => {
    expect(readTrimmedString('  Dyson V11  ')).toBe('Dyson V11');
  });

  it('returns null for blank or non-string input', () => {
    expect(readTrimmedString('   ')).toBeNull();
    expect(readTrimmedString({ text: 'Dyson V11' })).toBeNull();
    expect(readTrimmedString(['Dyson V11'])).toBeNull();
  });

  it('filters non-string entries out of string arrays', () => {
    expect(readTrimmedStringArray(['  AUDIO  ', '', null, { mode: 'bad' }, ' TEXT '])).toEqual([
      'AUDIO',
      'TEXT',
    ]);
  });
});
