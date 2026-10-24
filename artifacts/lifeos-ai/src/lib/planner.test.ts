import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSchedule } from './planner';
import { type Availability, type ScheduleItem, type Task, toMinutes } from './models';

function makeTask(id: string, overrides: Partial<Omit<Task, 'id'>> = {}): Task {
  return {
    id,
    title: id,
    category: 'work',
    durationMinutes: 60,
    priority: 'medium',
    completed: false,
    ...overrides,
  };
}

function makeAvailability(overrides: Partial<Availability> = {}): Availability {
  return {
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0,
    breakPreference: 'standard',
    energy: 'medium',
    unavailablePeriods: [],
    ...overrides,
  };
}

function assertNoOverlaps(items: ScheduleItem[]) {
  const slots = items.map(item => ({
    item,
    start: toMinutes(item.startTime),
    end: toMinutes(item.endTime),
  }));

  for (const slot of slots) {
    assert.ok(slot.start < slot.end, `${slot.item.title} must have a positive time range`);
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const left = slots[i];
      const right = slots[j];
      assert.ok(
        left.end <= right.start || right.end <= left.start,
        `${left.item.title} (${left.item.startTime}-${left.item.endTime}) overlaps ${right.item.title} (${right.item.startTime}-${right.item.endTime})`,
      );
    }
  }
}

test('scheduled tasks and the protected break never overlap', () => {
  const availability = makeAvailability({ breakMinutes: 30 });
  const schedule = generateSchedule([
    makeTask('focus-one', { durationMinutes: 120, priority: 'high' }),
    makeTask('focus-two', { durationMinutes: 120, priority: 'medium' }),
    makeTask('focus-three', { durationMinutes: 90, priority: 'low' }),
  ], availability);

  assert.equal(schedule.items.filter(item => item.kind === 'task').length, 3);
  assert.ok(schedule.items.some(item => item.kind === 'break'), 'the requested break should be planned');
  assertNoOverlaps(schedule.items);
});

test('flexible work moves around every blocked period', () => {
  const availability = makeAvailability({
    unavailablePeriods: [
      { id: 'appointment', label: 'Appointment', startTime: '10:00', endTime: '11:00' },
      { id: 'errand', label: 'Errand', startTime: '12:30', endTime: '13:00' },
    ],
  });
  const schedule = generateSchedule([makeTask('deep-work', { durationMinutes: 180 })], availability);
  const item = schedule.items.find(entry => entry.taskId === 'deep-work');

  assert.ok(item, 'the task should fit after the blocked periods');
  assert.equal(item.startTime, '13:00');
  for (const period of availability.unavailablePeriods) {
    const blockedStart = toMinutes(period.startTime);
    const blockedEnd = toMinutes(period.endTime);
    assert.ok(
      toMinutes(item.startTime) >= blockedEnd || toMinutes(item.endTime) <= blockedStart,
      `the task must not overlap ${period.label}`,
    );
  }
});

test('fixed commitments keep their times and conflicting commitments are unscheduled', () => {
  const availability = makeAvailability({
    unavailablePeriods: [
      { id: 'blocked', label: 'Appointment', startTime: '10:00', endTime: '11:00' },
      { id: 'second-block', label: 'Errand', startTime: '13:00', endTime: '13:30' },
    ],
  });
  const schedule = generateSchedule([
    makeTask('blocked-fixed', { fixedStartTime: '10:30', durationMinutes: 30 }),
    makeTask('fixed-meeting', { fixedStartTime: '12:00', durationMinutes: 60 }),
    makeTask('overlapping-fixed', { fixedStartTime: '12:30', durationMinutes: 30 }),
    makeTask('flexible', { durationMinutes: 60 }),
  ], availability);

  const meeting = schedule.items.find(item => item.taskId === 'fixed-meeting');
  assert.ok(meeting);
  assert.equal(meeting.startTime, '12:00');
  assert.equal(meeting.endTime, '13:00');
  assert.ok(schedule.unscheduled.some(item => item.taskId === 'blocked-fixed'));
  assert.ok(schedule.unscheduled.some(item => item.taskId === 'overlapping-fixed'));
  assertNoOverlaps(schedule.items);
});

test('deadlines are finish-by cutoffs, including an exact-fit deadline', () => {
  const schedule = generateSchedule([
    makeTask('exact-deadline', { durationMinutes: 60, dueTime: '10:00', priority: 'high' }),
    makeTask('too-late', { durationMinutes: 60, dueTime: '09:45', priority: 'high' }),
  ], makeAvailability({ endTime: '12:00' }));

  const exactFit = schedule.items.find(item => item.taskId === 'exact-deadline');
  assert.ok(exactFit);
  assert.equal(exactFit.endTime, '10:00');
  assert.ok(schedule.unscheduled.some(item => item.taskId === 'too-late'));
  for (const item of schedule.items.filter(entry => entry.kind === 'task')) {
    const task = item.taskId === 'exact-deadline' ? { dueTime: '10:00' } : undefined;
    if (task?.dueTime) assert.ok(toMinutes(item.endTime) <= toMinutes(task.dueTime));
  }
});

test('tasks that cannot fit remain visible with a reason', () => {
  const schedule = generateSchedule([
    makeTask('too-long', { durationMinutes: 90 }),
    makeTask('deadline-passed', { durationMinutes: 15, dueTime: '09:00' }),
  ], makeAvailability({ endTime: '10:00' }));

  assert.equal(schedule.items.filter(item => item.kind === 'task').length, 0);
  const tooLong = schedule.unscheduled.find(item => item.taskId === 'too-long');
  const passed = schedule.unscheduled.find(item => item.taskId === 'deadline-passed');
  assert.ok(tooLong);
  assert.match(tooLong.reason, /longer than the remaining work window/);
  assert.ok(passed);
  assert.match(passed.reason, /Deadline has passed/);
});

test('replanning preserves completed work and fixed commitments and reports newly infeasible work', () => {
  const availability = makeAvailability();
  const originalTasks = [
    makeTask('at-risk', { durationMinutes: 180, priority: 'high' }),
    makeTask('completed-work', { durationMinutes: 60, priority: 'low' }),
    makeTask('fixed-commitment', { fixedStartTime: '16:00', durationMinutes: 60 }),
  ];
  const originalSchedule = generateSchedule(originalTasks, availability);

  assert.equal(originalSchedule.items.find(item => item.taskId === 'at-risk')?.startTime, '09:00');
  assert.equal(originalSchedule.items.find(item => item.taskId === 'completed-work')?.startTime, '12:00');
  assert.equal(originalSchedule.items.find(item => item.taskId === 'fixed-commitment')?.startTime, '16:00');

  const replanned = generateSchedule(
    originalTasks.map(task => task.id === 'completed-work' ? { ...task, completed: true } : task),
    availability,
    { disruptionMinutes: 360, previous: originalSchedule },
  );

  const completed = replanned.items.find(item => item.taskId === 'completed-work');
  const fixed = replanned.items.find(item => item.taskId === 'fixed-commitment');
  assert.ok(completed);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.startTime, '12:00');
  assert.ok(fixed);
  assert.equal(fixed.startTime, '16:00');
  assert.ok(replanned.unscheduled.some(item => item.taskId === 'at-risk'));
  const reportedChange = replanned.changes?.find(change => change.taskId === 'at-risk');
  assert.ok(reportedChange);
  assert.equal(reportedChange.toStartTime, undefined);
  assert.equal(reportedChange.reason, replanned.unscheduled.find(item => item.taskId === 'at-risk')?.reason);
  assertNoOverlaps(replanned.items);
});
