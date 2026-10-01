import { describe, expect, it } from 'vitest';
import { formatWeight } from './formatWeight';

describe('formatWeight', () => {
  it('usa vírgula decimal e uma casa, no padrão brasileiro', () => {
    expect(formatWeight(1)).toBe('×1,0');
    expect(formatWeight(1.5)).toBe('×1,5');
    expect(formatWeight(0.5)).toBe('×0,5');
    expect(formatWeight(2)).toBe('×2,0');
  });
});
