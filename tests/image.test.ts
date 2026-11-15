import { describe, expect, it } from 'vitest';
import { MAX_OCR_SIDE, scaledSize } from '../src/image';

describe('scaledSize', () => {
  it(`caps the long side at ${MAX_OCR_SIDE}px for OCR`, () => {
    expect(MAX_OCR_SIDE).toBe(1280);
  });

  it('shrinks an iPhone photo, keeping its shape', () => {
    expect(scaledSize(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
    expect(scaledSize(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
    expect(scaledSize(4284, 5712, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it('leaves images that already fit alone (never enlarges)', () => {
    expect(scaledSize(480, 160, 1280)).toBeNull();
    expect(scaledSize(1280, 720, 1280)).toBeNull();
  });

  it('never rounds a side down to zero', () => {
    expect(scaledSize(10000, 2, 1280)).toEqual({ width: 1280, height: 1 });
  });
});
