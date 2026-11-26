import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES } from '@edw/shared';
import { pupilsRefusal } from './gate.js';

describe('pupilsRefusal', () => {
  it('lets pupils sign in only with PUPILS=on: unset is off', () => {
    expect(pupilsRefusal({})).toBe('pupils_off');
    expect(pupilsRefusal({ PUPILS: 'off' })).toBe('pupils_off');
    expect(pupilsRefusal({ PUPILS: 'on' })).toBeNull();
  });

  it('refuses a workspace whose pupils switch is off, as every workspace starts', () => {
    expect(pupilsRefusal({ PUPILS: 'on' }, { features: DEFAULT_FEATURES })).toBe('feature_off');
    expect(pupilsRefusal({ PUPILS: 'on' }, { features: { ...DEFAULT_FEATURES, pupils: true } })).toBeNull();
    // The server setting wins over the switch.
    expect(pupilsRefusal({ PUPILS: 'off' }, { features: { ...DEFAULT_FEATURES, pupils: true } })).toBe('pupils_off');
    expect(pupilsRefusal({}, { features: { ...DEFAULT_FEATURES, pupils: true } })).toBe('pupils_off');
  });
});
