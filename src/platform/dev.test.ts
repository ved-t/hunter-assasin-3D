import { describe, expect, it } from 'vitest';
import { createWebStorage } from './dev';

class FakeStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

class ThrowingStorage extends FakeStorage {
  override getItem(): string | null {
    throw new Error('SecurityError');
  }
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('createWebStorage', () => {
  it('round-trips through the backing store', async () => {
    const backing = new FakeStorage();
    const storage = createWebStorage(backing);
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');
    expect(backing.length).toBe(1);
  });

  it('returns null for missing keys', async () => {
    expect(await createWebStorage(new FakeStorage()).get('missing')).toBeNull();
  });

  it('falls back to memory when the backing store throws', async () => {
    const storage = createWebStorage(new ThrowingStorage());
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');
  });

  it('works with no backing store at all', async () => {
    const storage = createWebStorage(null);
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');
  });
});
