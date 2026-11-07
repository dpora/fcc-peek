import { describe, expect, it } from 'vitest';
import { fakeCameraSource } from '../src/devCamera';

describe('fakeCameraSource', () => {
  it('is off without the fakecam parameter', () => {
    expect(fakeCameraSource('')).toBeNull();
    expect(fakeCameraSource('?other=1')).toBeNull();
  });

  it('shows the built-in label for a bare ?fakecam', () => {
    expect(fakeCameraSource('?fakecam')).toEqual({ kind: 'label' });
    expect(fakeCameraSource('?fakecam=')).toEqual({ kind: 'label' });
    expect(fakeCameraSource('?x=1&fakecam')).toEqual({ kind: 'label' });
  });

  it('uses an image URL when one is given', () => {
    expect(fakeCameraSource('?fakecam=/labels/uv5r.jpg')).toEqual({ kind: 'image', url: '/labels/uv5r.jpg' });
    expect(fakeCameraSource('?fakecam=%2F%40fs%2FC%3A%2Fpics%2Fa%20b.jpg')).toEqual({ kind: 'image', url: '/@fs/C:/pics/a b.jpg' });
  });
});
