import { describe, expect, it } from 'vitest';
import { boxInFrame } from '../src/viewfinder';

describe('boxInFrame', () => {
  it('maps the centred box plus margin when preview and frame match', () => {
    expect(boxInFrame(1000, 750, 1000, 750)).toEqual({ x: 16, y: 221, width: 968, height: 308 });
  });

  it('accounts for the frame sides cut off by object-fit: cover', () => {
    // A 16:9 frame in a 4:3 preview: the frame is scaled to the preview height and its sides are hidden.
    expect(boxInFrame(400, 300, 1920, 1080)).toEqual({ x: 263, y: 318, width: 1394, height: 444 });
  });

  it('stays inside the frame', () => {
    const r = boxInFrame(300, 80, 300, 80);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBe(0);
    expect(r.height).toBe(80);
  });
});
