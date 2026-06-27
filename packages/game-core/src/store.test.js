import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SnapshotStore } from './store.js';

describe('SnapshotStore', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'snap-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('save then load round-trips a snapshot', () => {
    const store = new SnapshotStore(dir);
    const snap = { code: 'ABCD', state: { phase: 'play', n: 3 } };
    store.save('ABCD', snap);
    expect(store.load('ABCD')).toEqual(snap);
  });

  it('list returns saved room codes', () => {
    const store = new SnapshotStore(dir);
    store.save('ABCD', { code: 'ABCD' });
    store.save('WXYZ', { code: 'WXYZ' });
    expect(store.list().sort()).toEqual(['ABCD', 'WXYZ']);
  });

  it('delete removes a snapshot and is safe on a missing one', () => {
    const store = new SnapshotStore(dir);
    store.save('ABCD', { code: 'ABCD' });
    store.delete('ABCD');
    expect(store.list()).toEqual([]);
    expect(() => store.delete('ABCD')).not.toThrow();
  });

  it('list is empty for a fresh directory', () => {
    expect(new SnapshotStore(dir).list()).toEqual([]);
  });
});
