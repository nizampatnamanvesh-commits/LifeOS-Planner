export type Priority = 'low' | 'medium' | 'high';
export type BreakPreference = 'short' | 'standard' | 'long';
export type Energy = 'low' | 'medium' | 'high';
export type Task = {
  id: string;
  title: string;
  description?: string;
  category: string;
  durationMinutes: number;
  dueTime?: string;
  priority: Priority;
  fixedStartTime?: string;
  completed: boolean;
  actualMinutes?: number;
};
export type UnavailablePeriod = { id: string; label: string; startTime: string; endTime: string };
export type Availability = {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  breakPreference: BreakPreference;
  energy: Energy;
  unavailablePeriods: UnavailablePeriod[];
};
export type ScheduleItem = {
  id: string;
  taskId?: string;
  title: string;
  startTime: string;
  endTime: string;
  kind: 'task' | 'break';
  priority?: Priority;
  status: 'planned' | 'completed' | 'disrupted';
  explanation?: string;
};
export type UnscheduledTask = { taskId: string; reason: string };
export type ScheduleChange = { taskId: string; title: string; fromStartTime?: string; toStartTime?: string; reason: string };
export type Schedule = {
  items: ScheduleItem[];
  unscheduled: UnscheduledTask[];
  changes?: ScheduleChange[];
  disruptionMinutes?: number;
  explanation: string[];
  generatedAt: string;
};
export type Settings = { collapsed: boolean; lastPlannedAt?: string };
export type AppState = {
  tasks: Task[];
  availability: Availability;
  schedule: Schedule | null;
  settings: Settings;
};

export const toMinutes = (time: string): number => {
  if (!/^\d{2}:\d{2}$/.test(time)) return NaN;
  const [h, m] = time.split(':').map(Number);
  if (h > 23 || m > 59) return NaN;
  return h * 60 + m;
};
export const fromMinutes = (value: number): string => {
  const minute = Math.max(0, Math.min(1439, Math.round(value)));
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
};
export const durationLabel = (minutes: number): string => minutes >= 60
  ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
  : `${minutes}m`;
export const timeLabel = (time: string): string => {
  const minutes = toMinutes(time);
  if (!Number.isFinite(minutes)) return time;
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
