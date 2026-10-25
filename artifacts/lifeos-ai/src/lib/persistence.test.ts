import assert from 'node:assert/strict';
import test from 'node:test';
import { persistAppState } from './persistence';

test('persists the current state as JSON', () => {
  let savedKey = '';
  let savedValue = '';
  const saved = persistAppState('lifeos-ai-v1', { tasks: [] }, () => ({
    setItem(key, value) {
      savedKey = key;
      savedValue = value;
    },
  }));

  assert.equal(saved, true);
  assert.equal(savedKey, 'lifeos-ai-v1');
  assert.deepEqual(JSON.parse(savedValue), { tasks: [] });
});

test('reports when browser storage rejects a save', () => {
  const saved = persistAppState('lifeos-ai-v1', { tasks: [] }, () => ({
    setItem() {
      throw new Error('Storage quota exceeded');
    },
  }));

  assert.equal(saved, false);
});
