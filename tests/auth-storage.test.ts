import { describe, expect, it, vi } from 'vitest';

import { createMemoryAuthStorage, createResilientAuthStorage } from '@/lib/authStorage';

describe('auth storage', () => {
  it('stores and removes values in memory', async () => {
    const storage = createMemoryAuthStorage();

    await storage.setItem('token', 'abc');
    await expect(storage.getItem('token')).resolves.toBe('abc');

    await storage.removeItem('token');
    await expect(storage.getItem('token')).resolves.toBeNull();
  });

  it('falls back after the primary storage throws', async () => {
    const primary = {
      getItem: vi.fn(async () => {
        throw new Error('boom');
      }),
      setItem: vi.fn(async () => {
        throw new Error('boom');
      }),
      removeItem: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    const onFallback = vi.fn();
    const storage = createResilientAuthStorage({
      primary,
      label: 'test-storage',
      onFallback,
    });

    await expect(storage.getItem('missing')).resolves.toBeNull();
    await storage.setItem('token', 'abc');
    await expect(storage.getItem('token')).resolves.toBe('abc');
    await storage.removeItem('token');
    await expect(storage.getItem('token')).resolves.toBeNull();

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(primary.getItem).toHaveBeenCalledTimes(1);
    expect(primary.setItem).not.toHaveBeenCalled();
    expect(primary.removeItem).not.toHaveBeenCalled();
  });
});
