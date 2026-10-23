import { type Availability, type Schedule, type ScheduleItem, type Task, fromMinutes, toMinutes } from './models';

type Slot = { start: number; end: number; label?: string };
const intersects = (a: Slot, b: Slot) => a.start < b.end && b.start < a.end;
const priorityScore = { high: 30, medium: 20, low: 10 };

export function validateAvailability(a: Availability): string[] {
  const errors: string[] = [];
  const start = toMinutes(a.startTime), end = toMinutes(a.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) errors.push('Workday end must be later than its start.');
  if (a.breakMinutes < 0 || a.breakMinutes > 120) errors.push('Break duration must be between 0 and 120 minutes.');
  for (const period of a.unavailablePeriods) {
    const pStart = toMinutes(period.startTime), pEnd = toMinutes(period.endTime);
    if (!period.label.trim()) errors.push('Give each unavailable period a label.');
    if (!Number.isFinite(pStart) || !Number.isFinite(pEnd) || pStart >= pEnd) errors.push(`${period.label || 'Unavailable period'} needs a valid start and end.`);
    else if (Number.isFinite(start) && Number.isFinite(end) && (pStart < start || pEnd > end)) errors.push(`${period.label} must fit within your workday.`);
  }
  for (let i = 0; i < a.unavailablePeriods.length; i++) {
    const left = a.unavailablePeriods[i];
    const leftSlot = { start: toMinutes(left.startTime), end: toMinutes(left.endTime) };
    for (const right of a.unavailablePeriods.slice(i + 1)) {
      const rightSlot = { start: toMinutes(right.startTime), end: toMinutes(right.endTime) };
      if (Number.isFinite(leftSlot.start) && Number.isFinite(rightSlot.start) && intersects(leftSlot, rightSlot)) {
        errors.push(`${left.label} overlaps ${right.label}. Adjust one of those blocked periods.`);
      }
    }
  }
  return errors;
}

export function validateTask(task: Task): string[] {
  const errors: string[] = [];
  if (!task.title.trim()) errors.push('Add a task title.');
  if (!task.category.trim()) errors.push('Choose a category.');
  if (!Number.isFinite(task.durationMinutes) || task.durationMinutes < 5 || task.durationMinutes > 720) errors.push('Duration must be between 5 minutes and 12 hours.');
  if (task.dueTime && !Number.isFinite(toMinutes(task.dueTime))) errors.push('Deadline must be a valid time.');
  if (task.fixedStartTime && !Number.isFinite(toMinutes(task.fixedStartTime))) errors.push('Fixed start must be a valid time.');
  if (task.actualMinutes != null && (!Number.isFinite(task.actualMinutes) || task.actualMinutes < 0 || task.actualMinutes > 1440)) errors.push('Actual time must be between 0 and 1440 minutes.');
  return errors;
}

function taskUrgency(task: Task, now: number): number {
  if (!task.dueTime) return 0;
  const mins = toMinutes(task.dueTime) - now;
  return mins <= 120 ? 22 : mins <= 240 ? 15 : mins <= 480 ? 8 : 2;
}

export function generateSchedule(tasks: Task[], availability: Availability, options: { disruptionMinutes?: number; previous?: Schedule | null } = {}): Schedule {
  const errors = validateAvailability(availability);
  const now = toMinutes(availability.startTime), nominalEnd = toMinutes(availability.endTime);
  const disruptionMinutes = Math.max(0, options.disruptionMinutes ?? 0);
  const end = Math.max(now, nominalEnd - disruptionMinutes);
  const eligible = tasks.filter(t => !t.completed);
  const items: ScheduleItem[] = [];
  const unscheduled: Schedule['unscheduled'] = [];
  const blockers: Slot[] = availability.unavailablePeriods.map(p => ({ start: toMinutes(p.startTime), end: toMinutes(p.endTime), label: p.label }));
  const fixed = eligible.filter(t => t.fixedStartTime).sort((a, b) => toMinutes(a.fixedStartTime!) - toMinutes(b.fixedStartTime!));
  const flexible = eligible.filter(t => !t.fixedStartTime);
  const fixedSlots: Array<{ task: Task; slot: Slot }> = [];

  if (errors.length) {
    return { items: [], unscheduled: eligible.map(t => ({ taskId: t.id, reason: 'Availability settings need attention before a safe plan can be made.' })), disruptionMinutes, explanation: errors, generatedAt: new Date().toISOString() };
  }
  for (const task of fixed) {
    const start = toMinutes(task.fixedStartTime!);
    const slot = { start, end: start + task.durationMinutes };
    const due = task.dueTime ? toMinutes(task.dueTime) : Infinity;
    const conflict = blockers.some(b => intersects(slot, b)) || fixedSlots.some(f => intersects(slot, f.slot));
    if (start < now || slot.end > nominalEnd || slot.end > due || conflict) {
      unscheduled.push({ taskId: task.id, reason: start < now ? 'Its fixed start has already passed; change the commitment time.' : slot.end > nominalEnd ? 'The fixed commitment extends beyond your workday.' : slot.end > due ? 'The commitment would finish after its deadline.' : 'This fixed time overlaps another commitment or unavailable period; choose a different time.' });
    } else {
      fixedSlots.push({ task, slot });
      items.push({ id: `task-${task.id}`, taskId: task.id, title: task.title, startTime: fromMinutes(start), endTime: fromMinutes(slot.end), kind: 'task', priority: task.priority, status: 'planned', explanation: 'Kept at its fixed time.' });
    }
  }
  const occupied = [...blockers, ...fixedSlots.map(f => f.slot)].sort((a, b) => a.start - b.start);
  let cursor = now;
  const focusFit = (task: Task) => availability.energy === 'low' ? Math.max(0, 40 - task.durationMinutes) / 5 : availability.energy === 'high' ? task.durationMinutes / 10 : 0;
  const sorted = flexible.sort((a, b) =>
    (priorityScore[b.priority] + taskUrgency(b, now) + focusFit(b)) - (priorityScore[a.priority] + taskUrgency(a, now) + focusFit(a)) ||
    (a.dueTime ? toMinutes(a.dueTime) : Infinity) - (b.dueTime ? toMinutes(b.dueTime) : Infinity) ||
    b.durationMinutes - a.durationMinutes || a.title.localeCompare(b.title));
  let breakInserted = false;
  const breakMinutes = availability.breakMinutes;
  const breakRatio = availability.breakPreference === 'short' ? 0.4 : availability.breakPreference === 'long' ? 0.56 : 0.48;
  const addBreak = (at: number) => {
    if (breakInserted || breakMinutes === 0) return;
    const length = breakMinutes;
    const endBreak = at + length;
    if (at >= now && endBreak <= end && !occupied.some(b => intersects({ start: at, end: endBreak }, b))) {
      items.push({ id: 'break-midday', title: availability.breakPreference === 'short' ? 'Reset break' : 'Lunch & reset', startTime: fromMinutes(at), endTime: fromMinutes(endBreak), kind: 'break', status: 'planned', explanation: 'Protected recovery time.' });
      occupied.push({ start: at, end: endBreak });
      breakInserted = true;
    }
  };
  for (const task of sorted) {
    let candidate = cursor;
    let placed = false;
    let reason = 'Not enough uninterrupted time remains inside your workday.';
    for (let attempts = 0; attempts < occupied.length + 4 && candidate + task.durationMinutes <= end; attempts++) {
      const due = task.dueTime ? toMinutes(task.dueTime) : Infinity;
      const slot = { start: candidate, end: candidate + task.durationMinutes };
      if (slot.end > due) { reason = 'The remaining available window would finish after its deadline; move the deadline or shorten the task.'; break; }
      const overlap = occupied.find(b => intersects(slot, b));
      if (overlap) { candidate = overlap.end; continue; }
      if (!breakInserted && breakMinutes > 0 && slot.start >= now + Math.floor((end - now) * breakRatio)) {
        const breakAt = Math.max(now + Math.floor((end - now) * breakRatio), candidate - breakMinutes);
        addBreak(breakAt);
        const newOverlap = occupied.find(b => intersects(slot, b));
        if (newOverlap) { candidate = newOverlap.end; continue; }
      }
      items.push({ id: `task-${task.id}`, taskId: task.id, title: task.title, startTime: fromMinutes(candidate), endTime: fromMinutes(slot.end), kind: 'task', priority: task.priority, status: 'planned', explanation: task.dueTime ? 'Placed to protect its deadline.' : 'Placed by priority and available focus time.' });
      occupied.push(slot);
      occupied.sort((a, b) => a.start - b.start);
      cursor = slot.end;
      placed = true;
      break;
    }
    if (!placed) {
      if (task.fixedStartTime) reason = 'Fixed commitment could not be placed.';
      else if (task.dueTime && toMinutes(task.dueTime) <= now) reason = 'Deadline has passed; update the deadline to include this task.';
      else if (task.durationMinutes > end - now) reason = 'Task is longer than the remaining work window; shorten or split it.';
      unscheduled.push({ taskId: task.id, reason });
    }
  }
  if (!breakInserted && breakMinutes > 0 && end - now >= 240) {
    const desired = now + Math.floor((end - now) * breakRatio);
    let at = desired;
    while (at + breakMinutes <= end && occupied.some(b => intersects({ start: at, end: at + breakMinutes }, b))) at = (occupied.find(b => intersects({ start: at, end: at + breakMinutes }, b))?.end ?? at + 10);
    if (at + breakMinutes <= end && !occupied.some(b => intersects({ start: at, end: at + breakMinutes }, b))) {
      items.push({ id: 'break-midday', title: availability.breakPreference === 'short' ? 'Reset break' : 'Lunch & reset', startTime: fromMinutes(at), endTime: fromMinutes(at + breakMinutes), kind: 'break', status: 'planned', explanation: 'Protected recovery time.' });
      breakInserted = true;
    }
  }
  if (!breakInserted && breakMinutes > 0) errors.push('There was not enough free space for the preferred break. Consider a shorter break or wider workday.');
  const explanations = [
    'Fixed commitments and unavailable periods were protected first.',
    `Flexible tasks were ordered by priority${eligible.some(t => t.dueTime) ? ', deadline urgency,' : ''} and duration.`,
    disruptionMinutes ? `${disruptionMinutes} minutes were removed from the end of the available window; no task records were removed.` : 'Task deadlines are treated as finish-by times.',
  ];
  const previous = options.previous;
  const completedItems = previous?.items.filter(i => i.taskId && tasks.find(t => t.id === i.taskId)?.completed) ?? [];
  for (const item of completedItems) {
    if (!items.some(i => i.taskId === item.taskId)) items.push({ ...item, status: 'completed' });
  }
  const changes = disruptionMinutes && previous ? previous.items
    .filter(item => item.kind === 'task' && item.taskId && item.status !== 'completed' && !tasks.find(t => t.id === item.taskId)?.completed)
    .flatMap(old => {
      const current = items.find(item => item.taskId === old.taskId && item.status !== 'completed');
      if (!current) {
        const missed = unscheduled.find(item => item.taskId === old.taskId);
        return [{ taskId: old.taskId!, title: old.title, fromStartTime: old.startTime, reason: missed?.reason ?? 'This task no longer fits in the reduced available window; adjust its duration or deadline.' }];
      }
      if (current.startTime !== old.startTime) return [{
        taskId: old.taskId!, title: old.title, fromStartTime: old.startTime, toStartTime: current.startTime,
        reason: `Moved from ${old.startTime} to ${current.startTime} to fit the reduced window while protecting commitments.`,
      }];
      return [];
    }) : [];
  return { items: items.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)), unscheduled, changes, disruptionMinutes, explanation: [...explanations, ...errors], generatedAt: new Date().toISOString() };
}
