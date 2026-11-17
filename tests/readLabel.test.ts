import { describe, expect, it, vi } from 'vitest';
import { readLabel } from '../src/readLabel';

const reader = (upright: string, turned: string) => vi.fn(async (upsideDown: boolean) => (upsideDown ? turned : upright));

describe('readLabel', () => {
  it('stops after the upright read when it finds an FCC ID', async () => {
    const read = reader('FCC ID: BCG-E3175A', 'junk');
    const onRetry = vi.fn();
    expect(await readLabel(read, onRetry)).toBe('FCC ID: BCG-E3175A');
    expect(read).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('reads the label turned over when the upright read finds none', async () => {
    const read = reader('V5LE3-9DB :DI DDF', 'FCC ID: BCG-E3175A');
    const onRetry = vi.fn();
    expect(await readLabel(read, onRetry)).toBe('FCC ID: BCG-E3175A');
    expect(read).toHaveBeenLastCalledWith(true);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps both reads, upright first, when neither has an FCC ID line', async () => {
    expect(await readLabel(reader('Model A1901', 'BCG-E3175A'))).toBe('Model A1901\nBCG-E3175A');
    expect(await readLabel(reader('', ''))).toBe('');
  });
});
