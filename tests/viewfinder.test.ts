import { describe, expect, it } from 'vitest';
import { boxInFrame } from '../src/viewfinder';

describe('boxInFrame', () => {
  it('maps the centred box (no margin) when preview and frame match', () => {
    expect(boxInFrame(1000, 750, 1000, 750)).toEqual({ x: 60, y: 265, width: 880, height: 220 });
  });

  it('accounts for the frame sides cut off by object-fit: cover', () => {
    // A 16:9 frame in a 4:3 preview: the frame is scaled to the preview height and its sides are hidden.
    expect(boxInFrame(400, 300, 1920, 1080)).toEqual({ x: 326, y: 382, width: 1267, height: 317 });
  });

  it('stays inside the frame', () => {
    const r = boxInFrame(300, 80, 300, 80);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBe(7);
    expect(r.y + r.height).toBeLessThanOrEqual(80);
    expect(r.x + r.width).toBeLessThanOrEqual(300);
  });
});
