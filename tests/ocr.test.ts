// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@gutenye/ocr-browser', () => ({ default: { create } }));

beforeEach(() => {
  vi.resetModules();
  create.mockReset();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('preloadOcr', () => {
  it('starts loading the model once, and reports ready when done', async () => {
    create.mockResolvedValue({});
    const { preloadOcr, isOcrReady } = await import('../src/ocr');
    expect(isOcrReady()).toBe(false);
    preloadOcr();
    preloadOcr();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(isOcrReady()).toBe(true);
  });

  it('forgets a failed download so the next attempt retries', async () => {
    create.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
    const { preloadOcr, isOcrReady } = await import('../src/ocr');
    preloadOcr(); // must not cause an unhandled rejection
    await flush();
    expect(isOcrReady()).toBe(false);
    preloadOcr();
    await flush();
    expect(create).toHaveBeenCalledTimes(2);
    expect(isOcrReady()).toBe(true);
  });
});
