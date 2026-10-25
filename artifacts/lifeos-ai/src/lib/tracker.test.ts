import assert from 'node:assert/strict';
import test from 'node:test';
import { clearTrackerMarks, getDaypart, getRemainingDays, getTrackerWindow, isValidTrackerState, localDateKey, summarizeTracker, type TrackerState } from './tracker';
import { persistAppState } from './persistence';

test('tracker window contains thirty consecutive local date keys across month boundaries', () => {
  const days = getTrackerWindow('2025-01-25');
  assert.equal(days.length, 30);
  assert.equal(days[0].date, '2025-01-25');
  assert.equal(days[7].date, '2025-02-01');
  assert.equal(days[29].date, '2025-02-23');
  assert.deepEqual(days.map(day => day.date), [...days].sort((a, b) => a.date.localeCompare(b.date)).map(day => day.date));
});

test('remaining day count is bounded and uses local calendar days', () => {
  assert.equal(getRemainingDays('2025-02-10', new Date(2025, 1, 10, 23)), 30);
  assert.equal(getRemainingDays('2025-02-10', new Date(2025, 1, 12, 1)), 28);
  assert.equal(getRemainingDays('2025-02-10', new Date(2025, 2, 20, 12)), 0);
});

test('greeting boundaries match local hours exactly', () => {
  const part = (hour: number) => getDaypart(new Date(2025, 0, 1, hour));
  assert.equal(part(4), 'night');
  assert.equal(part(5), 'morning');
  assert.equal(part(11), 'morning');
  assert.equal(part(12), 'afternoon');
  assert.equal(part(16), 'afternoon');
  assert.equal(part(17), 'evening');
  assert.equal(part(20), 'evening');
  assert.equal(part(21), 'night');
});

test('tracker validation and completion summaries derive from editable definitions and marks', () => {
  const state: TrackerState = {
    startDate: '2025-03-01',
    habits: [{ id: 'read', title: 'Read' }, { id: 'stretch', title: 'Stretch' }],
    checks: { '2025-03-01': { read: true }, '2025-03-02': { read: true, stretch: true } },
  };
  assert.equal(isValidTrackerState(state), true);
  assert.equal(isValidTrackerState({ ...state, startDate: '2025-02-30' }), false);
  assert.equal(isValidTrackerState({ ...state, habits: [{ id: '', title: '   ' }] }), false);
  const summary = summarizeTracker(state);
  assert.equal(summary.days.length, 30);
  assert.equal(summary.completed, 3);
  assert.equal(summary.pending, 57);
  assert.equal(summary.percent, 5);
  assert.equal(summary.days[0].percent, 50);
  assert.equal(summary.days[1].percent, 100);
});

test('tracker persistence uses its own key and clearing marks preserves definitions and start date', () => {
  const plannerKey = 'lifeos-ai-v1';
  const trackerKey = 'lifeos-planner-tracker-v1';
  const values = new Map<string, string>([[plannerKey, JSON.stringify({ tasks: ['keep'] })]]);
  const storage = { setItem(key: string, value: string) { values.set(key, value); } };
  const state: TrackerState = { startDate: '2025-05-01', habits: [{ id: 'h1', title: 'Walk' }], checks: { '2025-05-01': { h1: true } } };
  assert.equal(persistAppState(trackerKey, state, () => storage), true);
  const cleared = clearTrackerMarks(state);
  assert.deepEqual(cleared, { ...state, checks: {} });
  assert.deepEqual(JSON.parse(values.get(plannerKey)!), { tasks: ['keep'] });
  assert.deepEqual(JSON.parse(values.get(trackerKey)!), state);
  assert.equal(localDateKey(new Date(2025, 0, 9, 23)), '2025-01-09');
});
