export type Habit = { id: string; title: string };
export type TrackerState = {
  startDate: string;
  habits: Habit[];
  checks: Record<string, Record<string, boolean>>;
};
export type TrackerDay = { date: string; label: string; done: number; total: number; percent: number };

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateFromKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function getTrackerWindow(startDate: string): TrackerDay[] {
  const start = dateFromKey(startDate) ?? dateFromKey(localDateKey(new Date()))!;
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    return { date: key, label: new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date), done: 0, total: 0, percent: 0 };
  });
}

export function getRemainingDays(startDate: string, today = new Date()): number {
  const start = dateFromKey(startDate);
  if (!start) return 30;
  const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const elapsed = Math.floor((todayNoon.getTime() - start.getTime()) / 86400000);
  return Math.max(0, Math.min(30, 30 - elapsed));
}

export function isValidTrackerState(value: unknown): value is TrackerState {
  if (!value || typeof value !== 'object') return false;
  const state = value as TrackerState;
  return !!dateFromKey(state.startDate) && Array.isArray(state.habits) &&
    state.habits.every(h => !!h && typeof h.id === 'string' && typeof h.title === 'string' && !!h.title.trim()) &&
    !!state.checks && typeof state.checks === 'object' && !Array.isArray(state.checks) &&
    Object.entries(state.checks).every(([date, entries]) => !!dateFromKey(date) && !!entries && typeof entries === 'object' && !Array.isArray(entries) &&
      Object.values(entries).every(mark => typeof mark === 'boolean'));
}

export function summarizeTracker(state: TrackerState, window = getTrackerWindow(state.startDate)) {
  const days = window.map(day => {
    const done = state.habits.filter(h => state.checks[day.date]?.[h.id]).length;
    const total = state.habits.length;
    return { ...day, done, total, percent: total ? Math.round(done / total * 100) : 0 };
  });
  const possible = days.reduce((sum, day) => sum + day.total, 0);
  const completed = days.reduce((sum, day) => sum + day.done, 0);
  return {
    days, possible, completed, pending: possible - completed,
    percent: possible ? Math.round(completed / possible * 100) : 0,
    completedDays: days.filter(day => day.total > 0 && day.done === day.total).length,
  };
}

export function clearTrackerMarks(state: TrackerState): TrackerState {
  return { ...state, checks: {} };
}

export function getDaypart(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function getGreeting(date: Date): string {
  return ({ morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good night' })[getDaypart(date)];
}
