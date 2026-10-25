import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, CalendarDays, Check, CheckCircle2, CircleHelp, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { clearTrackerMarks, dateFromKey, getRemainingDays, getTrackerWindow, isValidTrackerState, localDateKey, summarizeTracker, type TrackerState } from '../lib/tracker';
import { persistAppState } from '../lib/persistence';

const TRACKER_KEY = 'lifeos-planner-tracker-v1';
const blankState = (): TrackerState => ({ startDate: localDateKey(new Date()), habits: [], checks: {} });

function readTracker(): TrackerState {
  try {
    const raw = localStorage.getItem(TRACKER_KEY);
    if (!raw) return blankState();
    const parsed: unknown = JSON.parse(raw);
    return isValidTrackerState(parsed) ? parsed : blankState();
  } catch {
    return blankState();
  }
}

function saveTracker(state: TrackerState) {
  const ok = persistAppState(TRACKER_KEY, state);
  window.dispatchEvent(new CustomEvent('lifeos-storage-status', { detail: { key: TRACKER_KEY, failed: !ok } }));
  return ok;
}

export default function TrackerPage() {
  const [tracker, setTracker] = useState<TrackerState>(readTracker);
  const [draft, setDraft] = useState('');
  const [clearDialog, setClearDialog] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  useEffect(() => { saveTracker(tracker); }, [tracker]);
  useEffect(() => {
    if (!clearDialog) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setClearDialog(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [clearDialog]);

  const windowDays = useMemo(() => getTrackerWindow(tracker.startDate), [tracker.startDate]);
  const summary = useMemo(() => summarizeTracker(tracker, windowDays), [tracker, windowDays]);
  const todayKey = localDateKey(new Date());
  const remaining = getRemainingDays(tracker.startDate);
  const weekly = useMemo(() => Array.from({ length: 5 }, (_, week) => {
    const days = summary.days.slice(week * 7, week * 7 + 7);
    const total = days.reduce((sum, day) => sum + day.total, 0);
    const done = days.reduce((sum, day) => sum + day.done, 0);
    return { week: `Week ${week + 1}`, percent: total ? Math.round(done / total * 100) : 0, done, total };
  }), [summary.days]);

  const addHabit = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setTracker(current => ({ ...current, habits: [...current.habits, { id: crypto.randomUUID(), title }] }));
    setDraft('');
  };
  const setCheck = (date: string, id: string, checked: boolean) => {
    setTracker(current => {
      const entries = { ...(current.checks[date] ?? {}) };
      if (checked) entries[id] = true;
      else delete entries[id];
      const checks = { ...current.checks };
      if (Object.keys(entries).length) checks[date] = entries;
      else delete checks[date];
      return { ...current, checks };
    });
  };
  const saveRename = (id: string) => {
    const title = editTitle.trim();
    if (!title) return;
    setTracker(current => ({ ...current, habits: current.habits.map(habit => habit.id === id ? { ...habit, title } : habit) }));
    setEditingId('');
  };
  const removeHabit = (id: string) => {
    const habit = tracker.habits.find(item => item.id === id);
    if (!habit || !window.confirm(`Delete “${habit.title}” and its completion marks?`)) return;
    setTracker(current => ({
      ...current,
      habits: current.habits.filter(item => item.id !== id),
      checks: Object.fromEntries(Object.entries(current.checks).map(([date, entries]) => {
        const next = { ...entries }; delete next[id]; return [date, next];
      }).filter(([, entries]) => Object.keys(entries as Record<string, boolean>).length)),
    }));
  };
  const clearMarks = () => {
    setTracker(current => clearTrackerMarks(current));
    setClearDialog(false);
  };

  return <main className="content tracker-content">
    <div className="tracker-hero">
      <div><div className="eyebrow">A little, every day</div><h1 className="page-title">Thirty days, your way.</h1><p className="page-subtitle">Choose the daily habits you want to make room for. Your tracker stays right here on this device.</p></div>
      <div className="tracker-start card"><label htmlFor="tracker-start-date">Challenge start date</label><input id="tracker-start-date" className="input" type="date" value={tracker.startDate} onChange={event => { if (dateFromKey(event.target.value)) setTracker(current => ({ ...current, startDate: event.target.value })); }} data-testid="input-tracker-start-date" /><span className="field-hint">{remaining} days remaining in this window</span></div>
    </div>
    <div className="grid metrics-grid tracker-metrics">
      <TrackerMetric label="Overall completion" value={`${summary.percent}%`} foot={`${summary.completed} of ${summary.possible} check-ins`} icon={<Activity size={17} />} />
      <TrackerMetric label="Completed" value={String(summary.completed)} foot={`${summary.completedDays} fully completed day${summary.completedDays === 1 ? '' : 's'}`} icon={<CheckCircle2 size={17} />} />
      <TrackerMetric label="Still open" value={String(summary.pending)} foot={`${tracker.habits.length} daily habit${tracker.habits.length === 1 ? '' : 's'} tracked`} icon={<CircleHelp size={17} />} />
    </div>
    <section className="card tracker-habits">
      <div className="card-head"><div><h2 className="card-title">Your daily habits</h2><div className="card-note">Edit the list as your priorities change.</div></div>{tracker.habits.length > 0 && <button className="btn btn-danger btn-small" onClick={() => setClearDialog(true)} data-testid="button-clear-tracker"><RotateCcw size={13} /> Clear all checkboxes</button>}</div>
      {!tracker.habits.length ? <div className="tracker-empty"><div className="empty-icon"><CalendarDays size={19} /></div><h3>Start with one small repeatable thing</h3><p>Add your first daily habit below. You can change the name or remove it at any time.</p></div> : <>
        <div className="tracker-scroll" role="region" aria-label="Thirty day habit completion grid" tabIndex={0}>
          <table className="tracker-table"><thead><tr><th scope="col" className="habit-col">Habit</th>{summary.days.map((day, index) => <th scope="col" key={day.date} className={day.date === todayKey ? 'today-column' : ''}><span>Day {index + 1}</span><small>{day.label}</small></th>)}</tr></thead>
            <tbody>{tracker.habits.map(habit => <tr key={habit.id} data-testid={`tracker-habit-${habit.id}`}><th scope="row" className="habit-col">
              {editingId === habit.id ? <form className="rename-form" onSubmit={event => { event.preventDefault(); saveRename(habit.id); }}><input className="input" aria-label={`Rename ${habit.title}`} value={editTitle} onChange={event => setEditTitle(event.target.value)} autoFocus /><button className="btn btn-icon btn-small" aria-label="Save habit name"><Check size={13} /></button><button type="button" className="btn btn-icon btn-small" aria-label="Cancel renaming" onClick={() => setEditingId('')}><X size={13} /></button></form> : <div className="habit-label"><span>{habit.title}</span><div className="habit-tools"><button className="text-action" onClick={() => { setEditingId(habit.id); setEditTitle(habit.title); }} aria-label={`Rename ${habit.title}`} data-testid={`button-rename-habit-${habit.id}`}>Rename</button><button className="text-action danger-text" onClick={() => removeHabit(habit.id)} aria-label={`Delete ${habit.title}`} data-testid={`button-delete-habit-${habit.id}`}><Trash2 size={13} /></button></div></div>}
            </th>{summary.days.map((day, index) => <td key={day.date} className={day.date === todayKey ? 'today-column' : ''}><label className="tracker-check-wrap" title={`${habit.title}, ${day.label}`}><input type="checkbox" checked={!!tracker.checks[day.date]?.[habit.id]} onChange={event => setCheck(day.date, habit.id, event.target.checked)} aria-label={`Mark ${habit.title} complete for day ${index + 1}, ${day.label}`} data-testid={`checkbox-${habit.id}-${day.date}`} /><span aria-hidden="true"><Check size={12} /></span></label></td>)}</tr>)}</tbody>
            <tfoot><tr><th scope="row" className="habit-col">Daily completion</th>{summary.days.map((day, index) => <td key={day.date} className={day.date === todayKey ? 'today-column' : ''}><span className="day-percent" aria-label={`${day.done} of ${day.total} habits complete`}>{day.total ? `${day.percent}%` : '—'}</span><small className="day-count">{day.done}/{day.total}</small></td>)}</tr></tfoot>
          </table>
        </div>
        <div className="table-caption">Scroll horizontally to explore all 30 days. Dates use your local calendar.</div>
      </>}
      <form className="add-habit-form" onSubmit={addHabit}><div className="field"><label htmlFor="new-habit">Add a daily habit</label><input id="new-habit" className="input" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Name a habit you want to track" maxLength={80} data-testid="input-new-habit" /></div><button className="btn btn-primary" type="submit" disabled={!draft.trim()} data-testid="button-add-habit"><Plus size={14} /> Add habit</button></form>
    </section>
    <div className="tracker-charts">
      <section className="card"><div className="card-head"><div><h2 className="card-title">Daily rhythm</h2><div className="card-note">Share of habits completed each day</div></div></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={summary.days} margin={{ top: 8, right: 12, left: -18, bottom: 2 }}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 4" /><XAxis dataKey="date" tickFormatter={(value: string) => String(Number(value.slice(-2)))} tick={{ fill: 'var(--chart-label)', fontSize: 10 }} interval={4} /><YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fill: 'var(--chart-label)', fontSize: 10 }} /><Tooltip contentStyle={{ background: 'var(--tooltip-bg)', borderColor: 'var(--chart-grid)', color: 'hsl(var(--foreground))', borderRadius: 10 }} labelFormatter={(value: string) => summary.days.find(day => day.date === value)?.label ?? value} formatter={(value: number) => [`${value}%`, 'Complete']} /><Line type="monotone" dataKey="percent" stroke="var(--chart-line)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div>
        <p className="chart-summary">The line shows daily completion from {summary.days[0]?.label} through {summary.days[29]?.label}. {summary.percent}% of all scheduled check-ins are complete.</p>
      </section>
      <section className="card"><div className="card-head"><div><h2 className="card-title">Week by week</h2><div className="card-note">Completion across five seven-day stretches</div></div></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={weekly} margin={{ top: 8, right: 8, left: -18, bottom: 2 }}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="week" tick={{ fill: 'var(--chart-label)', fontSize: 10 }} /><YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fill: 'var(--chart-label)', fontSize: 10 }} /><Tooltip contentStyle={{ background: 'var(--tooltip-bg)', borderColor: 'var(--chart-grid)', color: 'hsl(var(--foreground))', borderRadius: 10 }} formatter={(value: number, _name: string, item: { payload: { done: number; total: number } }) => [`${value}% (${item.payload.done}/${item.payload.total})`, 'Complete']} /><Bar dataKey="percent" fill="var(--chart-bar)" radius={[5, 5, 0, 0]} maxBarSize={44} /></BarChart></ResponsiveContainer></div>
        <p className="chart-summary">Each bar compares completed check-ins with all habits in that week.</p>
      </section>
    </div>
    <section className="card heatmap-card"><div className="card-head"><div><h2 className="card-title">Thirty-day activity</h2><div className="card-note">A quick look at consistency across the challenge</div></div><span className="pill violet">{summary.completed} check-ins</span></div>
      <div className="heatmap" role="list" aria-label="30 day completion heatmap">{summary.days.map((day, index) => <div className="heat-cell" role="listitem" key={day.date} data-level={day.total ? Math.min(4, Math.ceil(day.percent / 25)) : 0} title={`Day ${index + 1}, ${day.label}: ${day.done} of ${day.total} habits completed`} aria-label={`Day ${index + 1}, ${day.label}: ${day.done} of ${day.total} habits complete`}><span>{index + 1}</span></div>)}</div>
      <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}<span>More</span><span className="heatmap-note">Each square is one local calendar day.</span></div>
    </section>
    {clearDialog && <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) setClearDialog(false); }}><section className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-tracker-title" aria-describedby="clear-tracker-copy"><div className="dialog-head"><div><div className="eyebrow">A fresh page</div><h2 id="clear-tracker-title" className="dialog-title">Clear every checkbox?</h2><p id="clear-tracker-copy" className="page-subtitle">Only completion marks will be cleared. Your habits and challenge start date will stay as they are.</p></div></div><div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setClearDialog(false)} data-testid="button-cancel-clear-tracker">Keep checkboxes</button><button className="btn btn-danger" onClick={clearMarks} data-testid="button-confirm-clear-tracker">Clear checkboxes</button></div></section></div>}
  </main>;
}

function TrackerMetric({ label, value, foot, icon }: { label: string; value: string; foot: string; icon: React.ReactNode }) {
  return <div className="card metric-card tracker-metric"><div className="metric-top"><span className="metric-label">{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>;
}
