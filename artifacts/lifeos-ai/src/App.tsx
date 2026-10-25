import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import {
  Activity, AlertCircle, ArrowRight, CalendarClock, Check, CheckCircle2, ChevronLeft, CircleHelp, Clock3,
  Command, Coffee, Compass, ListTodo, Menu, MessageCircle, Pencil, Plus, RefreshCw,
  Search, Send, Sparkles, Trash2, TrendingUp, X, Zap,
} from 'lucide-react';
import { type AppState, type Availability, type Priority, type Task, type UnavailablePeriod, durationLabel, timeLabel, toMinutes } from './lib/models';
import { generateSchedule, validateAvailability, validateTask } from './lib/planner';
import { persistAppState } from './lib/persistence';

const STORE_KEY = 'lifeos-ai-v1';
const categories = ['Work', 'Personal', 'Home', 'Health', 'Learning'];

function seedState(): AppState {
  const tasks: Task[] = [
    { id: 't-brief', title: 'Finalize the product brief', description: 'Tighten the launch narrative and share with the team.', category: 'Work', durationMinutes: 60, dueTime: '11:30', priority: 'high', completed: false },
    { id: 't-review', title: 'Review Q3 numbers', description: 'Check the latest forecast before the afternoon sync.', category: 'Work', durationMinutes: 45, dueTime: '14:30', priority: 'high', fixedStartTime: '13:00', completed: false },
    { id: 't-email', title: 'Reply to Maya about the handoff', category: 'Work', durationMinutes: 20, dueTime: '16:00', priority: 'medium', completed: false },
    { id: 't-groceries', title: 'Order groceries for the week', category: 'Home', durationMinutes: 25, priority: 'medium', completed: false },
    { id: 't-walk', title: 'Take a proper lunch walk', category: 'Health', durationMinutes: 30, priority: 'low', completed: false },
    { id: 't-research', title: 'Read the customer research notes', description: 'Pull out three useful patterns for next week.', category: 'Learning', durationMinutes: 40, dueTime: '17:00', priority: 'low', completed: false },
  ];
  const availability: Availability = {
    startTime: '08:30', endTime: '17:30', breakMinutes: 30, breakPreference: 'standard', energy: 'high',
    unavailablePeriods: [{ id: 'meeting-1', label: 'Team stand-up', startTime: '09:30', endTime: '10:00' }],
  };
  return { tasks, availability, schedule: generateSchedule(tasks, availability), settings: { collapsed: false } };
}

function readState(): AppState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seedState();
    const value = JSON.parse(raw) as AppState;
    if (!value || !Array.isArray(value.tasks) || !value.availability || !value.settings) return seedState();
    const tasks = value.tasks.filter((t): t is Task =>
      !!t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.category === 'string' &&
      Number.isFinite(Number(t.durationMinutes)) && Number(t.durationMinutes) >= 5 && Number(t.durationMinutes) <= 720 &&
      typeof t.completed === 'boolean' && ['low', 'medium', 'high'].includes(t.priority) &&
      (!t.dueTime || Number.isFinite(toMinutes(t.dueTime))) && (!t.fixedStartTime || Number.isFinite(toMinutes(t.fixedStartTime))) &&
      (t.actualMinutes == null || Number.isFinite(t.actualMinutes) && t.actualMinutes >= 0 && t.actualMinutes <= 1440));
    const availability = value.availability;
    if (!Array.isArray(availability.unavailablePeriods) || !Number.isFinite(toMinutes(availability.startTime)) || !Number.isFinite(toMinutes(availability.endTime)) ||
      !Number.isFinite(availability.breakMinutes) || availability.breakMinutes < 0 || availability.breakMinutes > 120 ||
      !['short', 'standard', 'long'].includes(availability.breakPreference) || !['low', 'medium', 'high'].includes(availability.energy) ||
      availability.unavailablePeriods.some(p => !p || typeof p.id !== 'string' || typeof p.label !== 'string' || !Number.isFinite(toMinutes(p.startTime)) || !Number.isFinite(toMinutes(p.endTime)))) return seedState();
    const validSchedule = !!value.schedule && Array.isArray(value.schedule.items) && Array.isArray(value.schedule.unscheduled) &&
      value.schedule.items.every(i => i && typeof i.id === 'string' && typeof i.title === 'string' && Number.isFinite(toMinutes(i.startTime)) && Number.isFinite(toMinutes(i.endTime)) && ['task', 'break'].includes(i.kind)) &&
      value.schedule.unscheduled.every(i => i && typeof i.taskId === 'string' && typeof i.reason === 'string');
    return { tasks, availability, schedule: validSchedule ? value.schedule : generateSchedule(tasks, availability), settings: { collapsed: !!value.settings.collapsed, lastPlannedAt: value.settings.lastPlannedAt } };
  } catch {
    return seedState();
  }
}

type ToastFn = (text: string) => void;
type AppData = { state: AppState; setState: (s: AppState) => void; toast: ToastFn; showTask: (task?: Task) => void; replan: (mins: number) => void };

function LifeOS() {
  const [state, setState] = useState<AppState>(readState);
  const [saveFailed, setSaveFailed] = useState(false);
  const [toastText, setToastText] = useState('');
  const [taskDraft, setTaskDraft] = useState<Task | undefined>();
  const [taskDialog, setTaskDialog] = useState(false);
  const [replanDialog, setReplanDialog] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const toast: ToastFn = (text) => { setToastText(text); window.setTimeout(() => setToastText(''), 3000); };
  useEffect(() => {
    setSaveFailed(!persistAppState(STORE_KEY, state));
  }, [state]);
  useEffect(() => { setMobileOpen(false); }, [location]);
  const update = (next: AppState) => setState(next);
  const showTask = (task?: Task) => { setTaskDraft(task); setTaskDialog(true); };
  const replan = (minutes: number) => {
    const schedule = generateSchedule(state.tasks, state.availability, { disruptionMinutes: minutes, previous: state.schedule });
    update({ ...state, schedule, settings: { ...state.settings, lastPlannedAt: new Date().toISOString() } });
    setReplanDialog(false);
    toast(minutes ? `Plan adjusted for ${minutes} lost minutes. Nothing was removed.` : 'Your day has been planned around your current commitments.');
  };
  const ctx: AppData = { state, setState: update, toast, showTask, replan };
  const navItems = [
    { href: '/', label: 'Today', icon: Compass },
    { href: '/tasks', label: 'Tasks', icon: ListTodo },
    { href: '/availability', label: 'Availability', icon: CalendarClock },
    { href: '/ask', label: 'Ask LifeOS', icon: MessageCircle },
    { href: '/progress', label: 'Progress', icon: TrendingUp },
  ];
  return <div className="app-shell">
    <aside className={`sidebar ${state.settings.collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Main navigation">
      <div className="brand"><div className="brand-mark"><Command size={18} strokeWidth={2.4} /></div>{!state.settings.collapsed && <div className="brand-name">LifeOS<span style={{ color: '#a995ff' }}> AI</span></div>}</div>
      <div className="nav-label">Workspace</div>
      <nav>{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} aria-label={label}><Icon size={17} /><span>{label}</span></Link>)}</nav>
      <div className="side-bottom">
        {!state.settings.collapsed && <div className="side-callout"><div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#c2b5ff', fontSize: 11, fontWeight: 700 }}><Sparkles size={14} /> Calm by design</div><p style={{ color: '#8f9bb0', fontSize: 10, lineHeight: 1.55, margin: '8px 0 0' }}>A plan that bends when real life does. Your data stays on this device.</p></div>}
        <button className="nav-link collapse-label" onClick={() => update({ ...state, settings: { ...state.settings, collapsed: !state.settings.collapsed } })} data-testid="button-collapse-nav" aria-label={state.settings.collapsed ? 'Expand navigation' : 'Collapse navigation'}><ChevronLeft size={17} style={{ transform: state.settings.collapsed ? 'rotate(180deg)' : undefined }} /><span>{state.settings.collapsed ? 'Expand' : 'Collapse navigation'}</span></button>
      </div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} data-testid="button-close-nav-overlay" style={{ position: 'fixed', inset: 0, zIndex: 15, background: '#0008', border: 0 }} />}
    <div className="main-area">
      <header className="topbar">
        <button className="btn btn-icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-nav" style={{ display: 'none' }}><Menu size={18} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span className="eyebrow" style={{ margin: 0 }}>PERSONAL COMMAND CENTER</span><span className="pill cyan">LOCAL DEMO</span></div>
        <div className="topbar-right">
          <span
            className={`mini-stat save-status ${saveFailed ? 'save-status-error' : ''}`}
            role={saveFailed ? 'alert' : 'status'}
            aria-label={saveFailed
              ? "Couldn't save changes. Your latest changes may be lost when you close or refresh this page."
              : 'Saved on this device'}
            title={saveFailed
              ? "Couldn't save changes. Your latest changes may be lost when you close or refresh this page."
              : 'Saved on this device'}
          >
            {saveFailed ? <><AlertCircle size={14} aria-hidden="true" /> Not saved</> : <><span className="save-status-dot" aria-hidden="true" /> Saved on this device</>}
          </span>
          <div style={{ width: 31, height: 31, display: 'grid', placeItems: 'center', borderRadius: 10, background: '#9c87ff1d', color: '#c3b5ff', fontSize: 11, fontWeight: 700 }}>L</div>
        </div>
      </header>
      {saveFailed && <div className="storage-warning" role="alert">
        <AlertCircle size={16} aria-hidden="true" />
        <span><strong>LifeOS couldn’t save your changes on this device.</strong> They’re still available during this session, but may be lost if you refresh or close this page.</span>
      </div>}
      <Switch>
        <Route path="/"><Dashboard data={ctx} openReplan={() => setReplanDialog(true)} /></Route>
        <Route path="/tasks"><TasksPage data={ctx} /></Route>
        <Route path="/availability"><AvailabilityPage data={ctx} /></Route>
        <Route path="/ask"><AskPage data={ctx} /></Route>
        <Route path="/progress"><ProgressPage data={ctx} /></Route>
        <Route><NotFound /></Route>
      </Switch>
      <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={location === href ? 'active' : ''} data-testid={`mobile-link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} /><span>{label === 'Ask LifeOS' ? 'Ask' : label}</span></Link>)}</nav>
    </div>
    {taskDialog && <TaskDialog initial={taskDraft} close={() => setTaskDialog(false)} data={ctx} />}
    {replanDialog && <ReplanDialog close={() => setReplanDialog(false)} onReplan={replan} />}
    {!!toastText && <div role="status" className="toast-line" data-testid="status-toast">{toastText}</div>}
    <style>{`@media(max-width:650px){.topbar>button[aria-label="Open navigation"]{display:inline-flex!important}.topbar{justify-content:flex-start}.topbar-right{margin-left:auto}.topbar .eyebrow{display:none}}`}</style>
  </div>;
}

function App() {
  return <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}><LifeOS /></Router>;
}

function PageHead({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{children && <div className="page-heading-actions">{children}</div>}</div>;
}

function Dashboard({ data, openReplan }: { data: AppData; openReplan: () => void }) {
  const { state } = data;
  const open = state.tasks.filter(t => !t.completed);
  const completed = state.tasks.filter(t => t.completed);
  const totalTasks = state.tasks.length;
  const completionRate = totalTasks ? Math.round(completed.length / totalTasks * 100) : 0;
  const planned = state.schedule?.items.filter(i => i.kind === 'task' && i.status !== 'completed') ?? [];
  const plannedMinutes = planned.reduce((sum, i) => sum + toMinutes(i.endTime) - toMinutes(i.startTime), 0);
  const blockedMinutes = state.availability.unavailablePeriods.reduce((sum, p) => sum + toMinutes(p.endTime) - toMinutes(p.startTime), 0);
  const availableMinutes = Math.max(0, toMinutes(state.availability.endTime) - toMinutes(state.availability.startTime) - blockedMinutes - state.availability.breakMinutes);
  const timelineItems = [...(state.schedule?.items ?? []), ...state.availability.unavailablePeriods.map(period => ({ id: `unavailable-${period.id}`, title: period.label, startTime: period.startTime, endTime: period.endTime, kind: 'unavailable' as const, status: 'planned' as const, taskId: undefined, priority: undefined }))].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const titleName = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date()).toLowerCase().includes('pm') ? 'Good afternoon' : 'Good morning';
  const highPriority = open.filter(t => t.priority === 'high').sort((a,b) => a.dueTime?.localeCompare(b.dueTime ?? '') ?? 0);
  return <main className="content">
    <PageHead eyebrow={date} title={`${titleName}, let's make today work.`} subtitle="A realistic plan for the things that matter — with room for real life.">
      <button className="btn btn-primary" onClick={() => data.replan(0)} data-testid="button-generate-day"><Sparkles size={15} /> Generate my day</button>
      <button className="btn btn-secondary" onClick={openReplan} data-testid="button-replan-day"><RefreshCw size={14} /> Replan my day</button>
    </PageHead>
    <div className="grid metrics-grid">
      <Metric label="Total tasks" value={String(totalTasks)} foot="Across today’s plan" icon={<ListTodo size={16} />} wash="#a995ff17" testId="metric-total-tasks" />
      <Metric label="Completed" value={String(completed.length)} foot={`${completionRate}% of tasks complete`} icon={<CheckCircle2 size={16} />} wash="#6bc89417" testId="metric-completed-tasks" />
      <Metric label="Pending" value={String(open.length)} foot="Not yet completed" icon={<CircleHelp size={16} />} wash="#f0b65d17" testId="metric-pending-tasks" />
      <Metric label="Planned vs available" value={durationLabel(plannedMinutes)} foot={`of ${durationLabel(availableMinutes)} focus time`} icon={<Clock3 size={16} />} wash="#5ac7d817" testId="metric-planned-time" />
      <Metric label="Day complete" value={`${completionRate}%`} foot={`${completed.length} of ${totalTasks} tasks done`} icon={<TrendingUp size={16} />} wash="#a995ff17" testId="metric-day-completion" />
      <Metric label="High priority" value={String(highPriority.length)} foot={highPriority[0]?.dueTime ? `Next deadline ${timeLabel(highPriority[0].dueTime)}` : 'Nothing urgent is due'} icon={<Zap size={16} />} wash="#f0b65d17" testId="metric-high-priority" />
    </div>
    {state.schedule?.unscheduled.length ? <div className="banner" role="status" data-testid="status-unscheduled"><div><div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{state.schedule.unscheduled.length} task{state.schedule.unscheduled.length > 1 ? 's' : ''} need a different plan</div><div className="banner-copy">Nothing was dropped. Review the reasons below and adjust a deadline, duration, or workday.</div></div><Link href="/tasks" className="btn btn-secondary btn-small">Review tasks <ArrowRight size={13} /></Link></div> : null}
    {state.schedule?.disruptionMinutes && state.schedule.changes?.length ? <section className="card" style={{ marginBottom: 18, borderColor: '#edbb6830' }} data-testid="section-replan-changes"><div className="card-head"><div><h2 className="card-title">What changed after {state.schedule.disruptionMinutes} minutes were lost</h2><div className="card-note">Every change is visible; no task records were removed.</div></div><span className="pill warning">{state.schedule.changes.length} changes</span></div>
      <div className="disruption-list">{state.schedule.changes.map(change => <div key={change.taskId} className="disruption-item" data-testid={`replan-change-${change.taskId}`}><div><strong style={{ color: '#dce2eb' }}>{change.title}</strong><div style={{ marginTop: 4, color: '#aab5c5' }}>{change.reason}</div></div><span className="mono" style={{ whiteSpace: 'nowrap', color: '#e8c57f' }}>{change.toStartTime ? `${timeLabel(change.fromStartTime!)} → ${timeLabel(change.toStartTime)}` : 'No new slot'}</span></div>)}</div>
      {state.schedule.changes.length === 0 && <div className="mini-stat">No task times needed to change.</div>}
    </section> : state.schedule?.disruptionMinutes ? <div className="banner" data-testid="section-replan-changes"><div><div style={{ fontWeight: 700, fontSize: 12 }}>Your plan absorbed the time loss</div><div className="banner-copy">No task start times changed. Fixed commitments and completed work were preserved.</div></div><span className="pill success">No changes needed</span></div> : null}
    <div className="dashboard-grid">
      <section className="card" aria-label="Today's timeline">
        <div className="card-head"><div><h2 className="card-title">Today at a glance</h2><div className="card-note">Your commitments, in a workable order</div></div><span className="pill violet">{state.schedule?.items.length ?? 0} blocks</span></div>
        {!timelineItems.length ? <Empty title="Your timeline is clear" text="Generate a day to make a focused plan from your tasks and availability." icon={<CalendarClock size={18} />} /> :
          <div className="timeline">{timelineItems.map(item => <div className="timeline-row" key={item.id} data-testid={`schedule-item-${item.id}`}><div className="timeline-time">{timeLabel(item.startTime)}</div><div className="timeline-rail"><div className={`timeline-dot ${item.kind === 'break' ? 'break' : item.kind === 'unavailable' ? 'reserved' : ''}`} /></div><div className="timeline-item"><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span className="timeline-item-title">{item.title}</span>{item.status === 'completed' && <span className="pill success">Done</span>}</div><div className="timeline-item-meta"><span>{timeLabel(item.endTime)}</span><span>·</span>{item.kind === 'break' ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Coffee size={11} /> Break</span> : item.kind === 'unavailable' ? <span className="pill cyan">Reserved</span> : <><span>{state.tasks.find(t => t.id === item.taskId)?.category ?? 'Task'}</span><span className={`priority ${item.priority ?? 'low'}`}><i />{item.priority}</span></>}</div></div></div>)}</div>}
        {state.schedule?.explanation?.length ? <div className="why-box" style={{ marginTop: 8 }}><strong style={{ color: '#d6ccff' }}>Why this plan:</strong> {state.schedule.explanation.slice(0, 2).join(' ')}</div> : null}
      </section>
      <aside className="card"><div className="card-head"><div><h2 className="card-title">High priority</h2><div className="card-note">The few that deserve your best attention</div></div><Link href="/tasks" aria-label="View all tasks" data-testid="link-view-tasks"><ArrowRight size={16} color="#a995ff" /></Link></div>
        {!highPriority.length ? <Empty title="No urgent tasks" text="A little breathing room is a good thing." icon={<CheckCircle2 size={18} />} /> : highPriority.slice(0, 4).map(task => <TaskRow key={task.id} task={task} onComplete={() => toggleTask(data, task.id)} onEdit={() => data.showTask(task)} />)}
        <div style={{ borderTop: '1px solid #ffffff0c', marginTop: 12, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="mini-stat">Ready for more?</span><button className="btn btn-secondary btn-small" onClick={() => data.showTask()} data-testid="button-quick-add-task"><Plus size={13} /> Add task</button></div>
      </aside>
    </div>
    <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center', color: '#8290a5', fontSize: 10 }}><Activity size={13} color="#74cda0" /> Your plan is local, private, and ready to adapt. {state.schedule?.disruptionMinutes ? <span className="pill warning">{state.schedule.disruptionMinutes} min adjusted</span> : null}</div>
  </main>;
}

function Metric({ label, value, foot, icon, wash, testId }: { label: string; value: string; foot: string; icon: ReactNode; wash: string; testId: string }) {
  return <div className="card metric-card" style={{ ['--metric-wash' as string]: wash }} data-testid={testId}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="metric-label">{label}</span><span style={{ color: '#a995ff' }}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>;
}

function TasksPage({ data }: { data: AppData }) {
  const { state } = data;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const tasks = useMemo(() => state.tasks.filter(t => {
    const matches = `${t.title} ${t.description ?? ''} ${t.category}`.toLowerCase().includes(search.toLowerCase());
    return matches && (filter === 'all' || filter === 'open' && !t.completed || filter === 'completed' && t.completed || t.priority === filter || t.category === filter);
  }).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99')), [state.tasks, search, filter]);
  const openCount = state.tasks.filter(t => !t.completed).length;
  return <main className="content">
    <PageHead eyebrow="Your responsibilities" title="Tasks" subtitle={`${openCount} open task${openCount === 1 ? '' : 's'} across work and life.`}>
      <button className="btn btn-primary" onClick={() => data.showTask()} data-testid="button-create-task"><Plus size={15} /> New task</button>
    </PageHead>
    <div className="card" style={{ padding: 16 }}>
      <div className="toolbar" style={{ margin: 0 }}>
        <div className="search-wrap"><Search size={15} /><input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks, categories…" aria-label="Search tasks" data-testid="input-search-tasks" /></div>
        <select className="select" style={{ width: 'auto', minWidth: 145 }} value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter tasks" data-testid="select-filter-tasks">
          <option value="all">All tasks</option><option value="open">Open</option><option value="completed">Completed</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => data.replan(0)} data-testid="button-plan-from-tasks"><Sparkles size={14} /> Plan my day</button>
      </div>
    </div>
    <div style={{ margin: '19px 2px 10px', display: 'flex', justifyContent: 'space-between', color: '#8d9aaf', fontSize: 11 }}><span>{tasks.length} result{tasks.length === 1 ? '' : 's'}</span><span>Tasks remain yours to change</span></div>
    {tasks.length ? tasks.map(task => <TaskCard key={task.id} task={task} data={data} />) : <Empty title={search || filter !== 'all' ? 'No tasks match that view' : 'Your task list is clear'} text={search || filter !== 'all' ? 'Try another search or filter.' : 'Add something you need to get done. We’ll help make it fit.'} icon={<ListTodo size={18} />} action={!search && filter === 'all' ? <button className="btn btn-primary btn-small" onClick={() => data.showTask()} data-testid="button-empty-create-task"><Plus size={13} /> Add your first task</button> : undefined} />}
    {state.schedule?.unscheduled.length ? <section style={{ marginTop: 20 }}><h2 className="card-title" style={{ marginBottom: 10 }}>Needs a different window</h2>{state.schedule.unscheduled.map(u => {
      const task = state.tasks.find(t => t.id === u.taskId);
      return task ? <div className="card" key={u.taskId} data-testid={`unscheduled-${u.taskId}`} style={{ padding: 14, marginBottom: 8, borderColor: '#edbb6833' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><div style={{ fontSize: 12, fontWeight: 700 }}>{task.title}</div><div className="warn-copy" style={{ marginTop: 5 }}>{u.reason}</div></div><button className="btn btn-secondary btn-small" onClick={() => data.showTask(task)} data-testid={`button-edit-unscheduled-${task.id}`}><Pencil size={12} /> Adjust</button></div></div> : null;
    })}</section> : null}
  </main>;
}

function TaskCard({ task, data }: { task: Task; data: AppData }) {
  return <div className="card task-card" data-testid={`task-card-${task.id}`}><div className="task-card-content">
    <button className={`check-button ${task.completed ? 'done' : ''}`} onClick={() => toggleTask(data, task.id)} aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`} data-testid={`button-complete-${task.id}`}>{task.completed && <Check size={13} />}</button>
    <div className="task-main"><div className="task-name" style={{ textDecoration: task.completed ? 'line-through' : undefined, color: task.completed ? '#8894a7' : undefined }}>{task.title}</div>{task.description && <div className="task-description">{task.description}</div>}<div className="task-sub"><span className="pill">{task.category}</span><span>{durationLabel(task.durationMinutes)}</span>{task.dueTime && <span>Due {timeLabel(task.dueTime)}</span>}{task.fixedStartTime && <span className="pill cyan">Fixed {timeLabel(task.fixedStartTime)}</span>}<span className={`priority ${task.priority}`}><i />{task.priority}</span>{task.completed && task.actualMinutes != null && <span>Actual {durationLabel(task.actualMinutes)}</span>}</div></div>
    <div className="task-actions"><button className="btn btn-icon btn-small" onClick={() => data.showTask(task)} aria-label={`Edit ${task.title}`} data-testid={`button-edit-${task.id}`}><Pencil size={13} /></button><button className="btn btn-icon btn-small" onClick={() => deleteTask(data, task.id)} aria-label={`Delete ${task.title}`} data-testid={`button-delete-${task.id}`}><Trash2 size={13} /></button></div>
  </div></div>;
}

function TaskRow({ task, onComplete, onEdit }: { task: Task; onComplete: () => void; onEdit: () => void }) {
  return <div className="task-row" data-testid={`priority-task-${task.id}`}><button className={`check-button ${task.completed ? 'done' : ''}`} onClick={onComplete} aria-label={`Complete ${task.title}`} data-testid={`button-priority-complete-${task.id}`}><Check size={12} /></button><div className="task-main"><div className="task-name">{task.title}</div><div className="task-sub"><span>{durationLabel(task.durationMinutes)}</span>{task.dueTime && <span>Due {timeLabel(task.dueTime)}</span>}</div></div><button className="btn btn-icon btn-small" onClick={onEdit} aria-label={`Edit ${task.title}`} data-testid={`button-priority-edit-${task.id}`}><Pencil size={12} /></button></div>;
}

function toggleTask(data: AppData, id: string) {
  const task = data.state.tasks.find(t => t.id === id);
  if (!task) return;
  const completed = !task.completed;
  const nextTasks = data.state.tasks.map(t => t.id === id ? { ...t, completed, actualMinutes: completed ? t.actualMinutes ?? t.durationMinutes : t.actualMinutes } : t);
  const nextSchedule = data.state.schedule ? generateSchedule(nextTasks, data.state.availability, {
    disruptionMinutes: data.state.schedule.disruptionMinutes ?? 0,
    previous: data.state.schedule,
  }) : null;
  data.setState({ ...data.state, tasks: nextTasks, schedule: nextSchedule });
  data.toast(completed ? 'Marked complete. Nice progress.' : 'Task reopened.');
}
function deleteTask(data: AppData, id: string) {
  const task = data.state.tasks.find(t => t.id === id);
  if (!task || !window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
  data.setState({ ...data.state, tasks: data.state.tasks.filter(t => t.id !== id), schedule: data.state.schedule ? { ...data.state.schedule, items: data.state.schedule.items.filter(i => i.taskId !== id), unscheduled: data.state.schedule.unscheduled.filter(i => i.taskId !== id) } : null });
  data.toast('Task deleted.');
}

function TaskDialog({ initial, close, data }: { initial?: Task; close: () => void; data: AppData }) {
  const [form, setForm] = useState<Task>(initial ?? { id: crypto.randomUUID(), title: '', description: '', category: 'Work', durationMinutes: 30, dueTime: '', priority: 'medium', fixedStartTime: '', completed: false });
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  const change = (key: keyof Task, value: string | number | boolean | undefined) => setForm(f => ({ ...f, [key]: value } as Task));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const validation = validateTask(form);
    if (form.fixedStartTime && form.dueTime && toMinutes(form.fixedStartTime) + Number(form.durationMinutes) > toMinutes(form.dueTime)) validation.push('The fixed task ends after its deadline.');
    if (form.fixedStartTime && (toMinutes(form.fixedStartTime) < toMinutes(data.state.availability.startTime) || toMinutes(form.fixedStartTime) + Number(form.durationMinutes) > toMinutes(data.state.availability.endTime))) validation.push('This task falls outside your workday.');
    if (form.fixedStartTime && data.state.availability.unavailablePeriods.some(p => toMinutes(form.fixedStartTime!) < toMinutes(p.endTime) && toMinutes(form.fixedStartTime!) + Number(form.durationMinutes) > toMinutes(p.startTime))) validation.push('This fixed task overlaps an unavailable period.');
    if (form.fixedStartTime && data.state.tasks.some(t => t.id !== form.id && !t.completed && t.fixedStartTime && toMinutes(form.fixedStartTime!) < toMinutes(t.fixedStartTime) + t.durationMinutes && toMinutes(form.fixedStartTime!) + Number(form.durationMinutes) > toMinutes(t.fixedStartTime))) validation.push('This fixed task overlaps another fixed task.');
    if (!form.fixedStartTime && form.dueTime && toMinutes(form.dueTime) < toMinutes(data.state.availability.startTime) + Number(form.durationMinutes)) validation.push('This task cannot finish by its deadline within your current workday.');
    if (validation.length) { setErrors(validation); return; }
    const normalized = { ...form, durationMinutes: Number(form.durationMinutes), dueTime: form.dueTime || undefined, fixedStartTime: form.fixedStartTime || undefined };
    const tasks = initial ? data.state.tasks.map(t => t.id === initial.id ? normalized : t) : [normalized, ...data.state.tasks];
    const schedule = generateSchedule(tasks, data.state.availability, { previous: data.state.schedule });
    data.setState({ ...data.state, tasks, schedule });
    data.toast(initial ? 'Task updated.' : 'Task added.');
    close();
  };
  return <div className="overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title"><div className="dialog-head"><div><div className="eyebrow">{initial ? 'Make an adjustment' : 'Add to your list'}</div><h2 id="task-dialog-title" className="dialog-title">{initial ? 'Edit task' : 'Create a task'}</h2></div><button className="btn btn-icon" onClick={close} aria-label="Close dialog" data-testid="button-close-task-dialog"><X size={16} /></button></div>
    <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="task-title">Task title</label><input id="task-title" className="input" value={form.title} onChange={e => change('title', e.target.value)} placeholder="What needs to get done?" autoFocus data-testid="input-task-title" /></div>
      <div className="field"><label htmlFor="task-description">Notes <span style={{ color: '#78869b', fontWeight: 400 }}>optional</span></label><textarea id="task-description" className="textarea" value={form.description ?? ''} onChange={e => change('description', e.target.value)} placeholder="A little context helps your plan make sense." data-testid="input-task-description" /></div>
      <div className="form-grid"><div className="field"><label htmlFor="task-category">Category</label><select id="task-category" className="select" value={form.category} onChange={e => change('category', e.target.value)} data-testid="select-task-category">{categories.map(c => <option key={c}>{c}</option>)}</select></div><div className="field"><label htmlFor="task-duration">Estimated minutes</label><input id="task-duration" className="input" type="number" min="5" max="720" step="5" value={form.durationMinutes} onChange={e => change('durationMinutes', Number(e.target.value))} data-testid="input-task-duration" /></div>
      <div className="field"><label htmlFor="task-priority">Priority</label><select id="task-priority" className="select" value={form.priority} onChange={e => change('priority', e.target.value as Priority)} data-testid="select-task-priority"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div><div className="field"><label htmlFor="task-deadline">Finish by <span style={{ color: '#78869b', fontWeight: 400 }}>optional</span></label><input id="task-deadline" className="input" type="time" value={form.dueTime ?? ''} onChange={e => change('dueTime', e.target.value)} data-testid="input-task-deadline" /></div>
      <div className="field"><label htmlFor="task-fixed">Fixed start <span style={{ color: '#78869b', fontWeight: 400 }}>optional</span></label><input id="task-fixed" className="input" type="time" value={form.fixedStartTime ?? ''} onChange={e => change('fixedStartTime', e.target.value)} data-testid="input-task-fixed-start" /><span className="field-hint">Use for appointments or commitments that cannot move.</span></div>
      {form.completed && <div className="field"><label htmlFor="task-actual">Actual minutes</label><input id="task-actual" className="input" type="number" min="0" max="1440" step="5" value={form.actualMinutes ?? ''} onChange={e => change('actualMinutes', e.target.value ? Number(e.target.value) : undefined)} data-testid="input-task-actual" /><span className="field-hint">Correct the logged time for progress reporting.</span></div>}
      </div>
      {errors.length > 0 && <div className="warn-copy" role="alert" data-testid="status-task-validation">{errors.map(error => <div key={error}>• {error}</div>)}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 17 }}><button type="button" className="btn btn-secondary" onClick={close} data-testid="button-cancel-task">Cancel</button><button className="btn btn-primary" type="submit" data-testid="button-save-task">{initial ? 'Save changes' : 'Add task'}</button></div>
    </form>
  </section></div>;
}

function ReplanDialog({ close, onReplan }: { close: () => void; onReplan: (mins: number) => void }) {
  const [custom, setCustom] = useState('');
  const presets = [15, 30, 45, 60];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return <div className="overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="replan-title"><div className="dialog-head"><div><div className="eyebrow">Plans should flex</div><h2 id="replan-title" className="dialog-title">Time got away from you?</h2><p className="page-subtitle" style={{ marginTop: 7 }}>Choose how much time was lost. Completed work and fixed commitments stay put; every other task remains in your list.</p></div><button className="btn btn-icon" onClick={close} aria-label="Close replan dialog" data-testid="button-close-replan"><X size={16} /></button></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9 }}>{presets.map(m => <button key={m} className="btn btn-secondary" style={{ justifyContent: 'space-between', padding: '0 14px', minHeight: 48 }} onClick={() => onReplan(m)} data-testid={`button-replan-${m}`}><span>{m} minutes lost</span><ArrowRight size={14} /></button>)}</div>
    <div className="field" style={{ marginTop: 16 }}><label htmlFor="replan-custom">A different amount</label><div style={{ display: 'flex', gap: 8 }}><input id="replan-custom" className="input" type="number" min="1" max="480" placeholder="Minutes" value={custom} onChange={e => setCustom(e.target.value)} data-testid="input-replan-custom" /><button className="btn btn-primary" disabled={!Number(custom) || Number(custom) > 480} onClick={() => onReplan(Number(custom))} data-testid="button-replan-custom">Adjust plan</button></div><span className="field-hint">We reduce your remaining window and explain anything that no longer fits.</span></div>
    <div className="why-box" style={{ marginTop: 16 }}>Nothing is silently removed. If a task no longer fits, it stays visible with a clear next step.</div>
  </section></div>;
}

function AvailabilityPage({ data }: { data: AppData }) {
  const [availability, setAvailability] = useState<Availability>(data.state.availability);
  const [errors, setErrors] = useState<string[]>([]);
  const [periodDraft, setPeriodDraft] = useState<Omit<UnavailablePeriod, 'id'>>({ label: '', startTime: '12:00', endTime: '12:30' });
  const save = () => {
    const validation = validateAvailability(availability);
    if (validation.length) { setErrors(validation); return; }
    setErrors([]);
    const schedule = generateSchedule(data.state.tasks, availability, { previous: data.state.schedule });
    data.setState({ ...data.state, availability, schedule });
    data.toast('Availability saved and the plan updated.');
  };
  const set = <K extends keyof Availability,>(key: K, value: Availability[K]) => setAvailability(a => ({ ...a, [key]: value } as Availability));
  const addPeriod = () => {
    const s = toMinutes(periodDraft.startTime), e = toMinutes(periodDraft.endTime);
    if (!periodDraft.label.trim() || !Number.isFinite(s) || s >= e) { setErrors(['Add a label and a valid start/end time for this period.']); return; }
    const item = { ...periodDraft, id: crypto.randomUUID() };
    setAvailability(a => ({ ...a, unavailablePeriods: [...a.unavailablePeriods, item] }));
    setPeriodDraft(p => ({ ...p, label: '' }));
    setErrors([]);
  };
  return <main className="content"><PageHead eyebrow="Make the day realistic" title="Availability" subtitle="Tell LifeOS when you can focus, when you need a pause, and what cannot move." />
    <div className="dashboard-grid" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(280px,.8fr)' }}>
      <section className="card"><div className="card-head"><div><h2 className="card-title">Your workday</h2><div className="card-note">A planning window, not a promise to fill every minute.</div></div><CalendarClock size={17} color="#a995ff" /></div>
        <div className="form-grid"><div className="field"><label htmlFor="day-start">Start of day</label><input id="day-start" className="input" type="time" value={availability.startTime} onChange={e => set('startTime', e.target.value)} data-testid="input-workday-start" /></div><div className="field"><label htmlFor="day-end">End of day</label><input id="day-end" className="input" type="time" value={availability.endTime} onChange={e => set('endTime', e.target.value)} data-testid="input-workday-end" /></div></div>
        <div className="setting-row"><div><div className="section-heading">Break duration</div><div className="card-note">A real pause keeps the plan sustainable.</div></div><select className="select" style={{ width: 150 }} value={availability.breakMinutes} onChange={e => set('breakMinutes', Number(e.target.value))} aria-label="Break duration" data-testid="select-break-duration"><option value="0">No planned break</option><option value="10">10 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></div>
        <div className="setting-row"><div><div className="section-heading">Break style</div><div className="card-note">We’ll use this preference when placing your pause.</div></div><div className="segmented" role="group" aria-label="Break preference">{(['short','standard','long'] as const).map(v => <button type="button" className={availability.breakPreference === v ? 'selected' : ''} onClick={() => set('breakPreference', v)} key={v} data-testid={`button-break-${v}`}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div></div>
        <div className="setting-row"><div><div className="section-heading">Energy today</div><div className="card-note">Used to calibrate task sequencing.</div></div><div className="segmented" role="group" aria-label="Energy level">{(['low','medium','high'] as const).map(v => <button type="button" className={availability.energy === v ? 'selected' : ''} onClick={() => set('energy', v)} key={v} data-testid={`button-energy-${v}`}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><button className="btn btn-primary" onClick={save} data-testid="button-save-availability"><Check size={14} /> Save availability</button></div>
        {errors.length > 0 && <div className="warn-copy" role="alert" style={{ marginTop: 13 }} data-testid="status-availability-validation">{errors.map(e => <div key={e}>• {e}</div>)}</div>}
      </section>
      <section className="card"><div className="card-head"><div><h2 className="card-title">Unavailable periods</h2><div className="card-note">Appointments and time already spoken for.</div></div><span className="pill cyan">{availability.unavailablePeriods.length}</span></div>
        {availability.unavailablePeriods.map(p => <div className="list-row" key={p.id} data-testid={`period-${p.id}`}><div><div style={{ fontSize: 12, fontWeight: 700 }}>{p.label}</div><div className="mini-stat" style={{ marginTop: 5 }}>{timeLabel(p.startTime)} – {timeLabel(p.endTime)}</div></div><button className="btn btn-icon btn-small" aria-label={`Remove ${p.label}`} onClick={() => setAvailability(a => ({ ...a, unavailablePeriods: a.unavailablePeriods.filter(x => x.id !== p.id) }))} data-testid={`button-remove-period-${p.id}`}><Trash2 size={13} /></button></div>)}
        {!availability.unavailablePeriods.length && <div className="mini-stat" style={{ padding: '10px 0 15px' }}>No blocked time yet. Add a commitment below.</div>}
        <div style={{ borderTop: '1px solid #ffffff11', paddingTop: 15, marginTop: 10 }}><div className="field"><label htmlFor="period-label">Add unavailable time</label><input id="period-label" className="input" placeholder="e.g. School pickup" value={periodDraft.label} onChange={e => setPeriodDraft(p => ({ ...p, label: e.target.value }))} data-testid="input-period-label" /></div>
          <div className="form-grid"><div className="field"><label htmlFor="period-start">Start</label><input id="period-start" className="input" type="time" value={periodDraft.startTime} onChange={e => setPeriodDraft(p => ({ ...p, startTime: e.target.value }))} data-testid="input-period-start" /></div><div className="field"><label htmlFor="period-end">End</label><input id="period-end" className="input" type="time" value={periodDraft.endTime} onChange={e => setPeriodDraft(p => ({ ...p, endTime: e.target.value }))} data-testid="input-period-end" /></div></div>
          <button className="btn btn-secondary" onClick={addPeriod} data-testid="button-add-period"><Plus size={13} /> Add period</button>
        </div>
      </section>
    </div>
    <div className="why-box" style={{ marginTop: 17 }}><strong style={{ color: '#d6ccff' }}>How scheduling works:</strong> Fixed-time tasks and unavailable periods are reserved first. Flexible tasks are placed by priority and deadline urgency, with finish-by deadlines respected. If the day is too full, we tell you exactly what to adjust.</div>
  </main>;
}

type ChatMessage = { role: 'assistant' | 'user'; text: string };
function assistantReply(question: string, state: AppState): string {
  const q = question.toLowerCase();
  const open = state.tasks.filter(t => !t.completed);
  const high = open.filter(t => t.priority === 'high');
  const schedule = state.schedule;
  if (/why/.test(q) && /(scheduled|planned|first|priority|priorit)/.test(q)) {
    const first = schedule?.items.filter(i => i.kind === 'task' && i.status !== 'completed' && i.taskId).sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))[0];
    const task = first?.taskId ? state.tasks.find(t => t.id === first.taskId) : undefined;
    if (!first || !task) return 'There is no scheduled task to explain yet. Generate your day and I can describe the first placement.';
    const deadline = task.dueTime ? ` Its finish-by time is ${timeLabel(task.dueTime)}, so the planner protects that deadline.` : ' It has no finish-by deadline.';
    return `“${task.title}” is first at ${timeLabel(first.startTime)} because it is ${task.priority} priority.${deadline} Flexible work is ordered by priority, deadline urgency, and duration, while fixed commitments and unavailable periods stay protected.`;
  }
  const hourWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const hourMatch = q.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five)\s*(?:hours?|hrs?|h)\b/);
  const minuteMatch = q.match(/\b(\d+)\s*(?:minutes?|mins?|m)\b/);
  const statedBudget = (hourMatch ? Number(hourMatch[1]) || hourWords[hourMatch[1]] || 0 : 0) * 60 + (minuteMatch ? Number(minuteMatch[1]) : 0);
  if (statedBudget > 0 && /(finish|fit|realistic|complete|left|have)/.test(q)) {
    const scheduled = schedule?.items
      .filter(i => i.kind === 'task' && i.status !== 'completed' && i.taskId)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
      .map(i => state.tasks.find(t => t.id === i.taskId))
      .filter((task): task is Task => !!task && !task.completed) ?? [];
    const candidates = scheduled.length ? scheduled : [...open].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - ({ high: 0, medium: 1, low: 2 }[b.priority]) || (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99')));
    const chosen: Task[] = [];
    let used = 0;
    for (const task of candidates) {
      if (used + task.durationMinutes <= statedBudget) {
        chosen.push(task);
        used += task.durationMinutes;
      }
    }
    const remaining = open.length - chosen.length;
    return chosen.length
      ? `With ${durationLabel(statedBudget)}, the current plan suggests ${chosen.map(t => `“${t.title}”`).join(', ')} (${durationLabel(used)} total). ${remaining ? `${remaining} other open task${remaining === 1 ? ' remains' : 's remain'} outside that estimate; no task was changed or removed.` : 'That covers every open task in your list.'}`
      : `I can’t fit a whole open task inside ${durationLabel(statedBudget)} based on the current estimates. The shortest open task is ${open.length ? `“${[...open].sort((a, b) => a.durationMinutes - b.durationMinutes)[0].title}” at ${durationLabel(Math.min(...open.map(t => t.durationMinutes)))}.` : 'none; your list is clear.'}`;
  }
  if (/what.*(first|priorit)|start|focus|next/.test(q)) {
    const next = schedule?.items.find(i => i.kind === 'task' && i.status !== 'completed');
    return next ? `Your next planned focus is “${next.title}” at ${timeLabel(next.startTime)}. It’s ${next.priority ?? 'a'} priority${next.explanation ? ` — ${next.explanation.toLowerCase()}` : ''}. There are ${high.length} high-priority task${high.length === 1 ? '' : 's'} still open.` : 'There is no planned task yet. Generate your day to place open tasks around your availability.' ;
  }
  if (/how many|remaining|left|open tasks/.test(q)) return `You have ${open.length} open task${open.length === 1 ? '' : 's'} and ${state.tasks.filter(t => t.completed).length} completed. ${high.length ? `${high.length} ${high.length === 1 ? 'is' : 'are'} high priority.` : 'No open task is marked high priority.'}`;
  if (/time|fit|capacity|busy|enough/.test(q)) {
    const taskMinutes = open.reduce((sum, t) => sum + t.durationMinutes, 0);
    const window = toMinutes(state.availability.endTime) - toMinutes(state.availability.startTime) - state.availability.unavailablePeriods.reduce((sum,p) => sum + toMinutes(p.endTime)-toMinutes(p.startTime),0) - state.availability.breakMinutes;
    const remaining = schedule?.unscheduled.length ?? 0;
    return `Your day has about ${durationLabel(Math.max(0, window))} of usable focus time after blocked periods and your break. Open work is estimated at ${durationLabel(taskMinutes)}.${remaining ? ` ${remaining} task${remaining > 1 ? 's' : ''} currently ${remaining > 1 ? 'do' : 'does'} not fit; review the specific reason on Today.` : ' The current plan fits the available window.'}`;
  }
  if (/deadline|due/.test(q)) {
    const due = open.filter(t => t.dueTime).sort((a,b) => a.dueTime!.localeCompare(b.dueTime!));
    return due.length ? `The next deadline is “${due[0].title},” due by ${timeLabel(due[0].dueTime!)}. ${due.length} open task${due.length === 1 ? ' has' : 's have'} a deadline. The planner treats each deadline as a finish-by time.` : 'None of your open tasks currently has a deadline. Add one when the timing matters.';
  }
  if (/plan|schedule|replan/.test(q)) {
    const planned = schedule?.items.filter(i => i.kind === 'task' && i.status !== 'completed').length ?? 0;
    return `Your current plan includes ${planned} task${planned === 1 ? '' : 's'} and ${schedule?.unscheduled.length ?? 0} task${schedule?.unscheduled.length === 1 ? '' : 's'} needing another window. Use “Generate my day” to rebuild around your current tasks and schedule, or “Replan my day” after time is lost.`;
  }
  const matches = open.filter(t => `${t.title} ${t.category} ${t.description ?? ''}`.toLowerCase().split(/\s+/).some(word => word.length > 3 && q.includes(word)));
  if (matches.length) return `I found ${matches.length} matching task${matches.length > 1 ? 's' : ''}: ${matches.map(t => `“${t.title}” (${durationLabel(t.durationMinutes)}, ${t.priority} priority${t.dueTime ? `, due ${timeLabel(t.dueTime)}` : ''})`).join('; ')}. I can summarize your plan, but I can’t change tasks from this demo chat.`;
  return `I’m running in local demo mode, so I can only reason from your current task list and schedule. You have ${open.length} open task${open.length === 1 ? '' : 's'} across ${new Set(open.map(t => t.category)).size} categor${new Set(open.map(t => t.category)).size === 1 ? 'y' : 'ies'}. Try asking what to focus on first, what is due next, how much time is available, or which work remains.`;
}

function AskPage({ data }: { data: AppData }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: 'I can help you make sense of today’s tasks and schedule. I use only the information stored on this device — no AI service or external connection. Ask what to focus on, what is due, or whether the day has enough room.' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const askQuestion = (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput('');
    setLoading(true);
    setMessages(m => [...m, { role: 'user', text: q }]);
    window.setTimeout(() => {
      setMessages(m => [...m, { role: 'assistant', text: assistantReply(q, data.state) }]);
      setLoading(false);
    }, 250);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); askQuestion(input); };
  const examples = ['What should I focus on first?', 'I have two hours left. What can I finish?', 'What is due next?'];
  return <main className="content"><PageHead eyebrow="Context from your own day" title="Ask LifeOS" subtitle="A grounded planning companion, not a black box." />
    <div className="chat-layout"><div className="banner" style={{ marginBottom: 15 }}><div><div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 12 }}><Sparkles size={14} color="#b7a8ff" /> Demo mode — deterministic answers</div><div className="banner-copy" style={{ marginTop: 4 }}>Responses are derived from the tasks and schedule saved in this browser. No external services, AI calls, or account required.</div></div><span className="pill cyan">Private</span></div>
      <section className="card" style={{ padding: 18 }} aria-label="Planning assistant conversation"><div className="chat-history" aria-live="polite">{messages.map((m, i) => <div key={`${i}-${m.role}`} className={`chat-msg ${m.role}`} data-testid={`chat-message-${i}`}><div className="chat-avatar">{m.role === 'assistant' ? <Sparkles size={14} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>You</span>}</div><div className="chat-bubble">{m.text}</div></div>)}{loading && <div className="chat-msg" role="status"><div className="chat-avatar"><Sparkles size={14} /></div><div className="chat-bubble">Checking your day…</div></div>}</div>
        <form className="chat-compose" onSubmit={submit}><input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about your day or a task…" aria-label="Ask LifeOS a question" data-testid="input-ask-question" /><button className="btn btn-primary btn-small" type="submit" disabled={!input.trim() || loading} aria-label="Send question" data-testid="button-send-question"><Send size={14} /> Ask</button></form>
      </section>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{examples.map((q,i) => <button key={q} className="btn btn-secondary btn-small" onClick={() => askQuestion(q)} disabled={loading} data-testid={`button-example-${i}`}>{q}</button>)}</div>
      <div className="mini-stat" style={{ marginTop: 15, lineHeight: 1.6 }}>For free-form questions, answers stay transparent about their limits and use your latest task and availability data.</div>
    </div>
  </main>;
}

function ProgressPage({ data }: { data: AppData }) {
  const { tasks } = data.state;
  const done = tasks.filter(t => t.completed);
  const open = tasks.filter(t => !t.completed);
  const total = tasks.length;
  const rate = total ? Math.round(done.length / total * 100) : 0;
  const estimated = tasks.reduce((sum,t) => sum + t.durationMinutes, 0);
  const actual = done.reduce((sum,t) => sum + (t.actualMinutes ?? t.durationMinutes), 0);
  const categoriesDone = categories.map(category => ({ category, done: done.filter(t => t.category === category).length, open: open.filter(t => t.category === category).length })).filter(c => c.done + c.open > 0);
  const reset = () => {
    if (!window.confirm('Reset the demo to its original sample tasks and schedule? Your current local changes will be replaced.')) return;
    const fresh = seedState();
    data.setState(fresh);
    data.toast('Demo reset to its original sample day.');
  };
  return <main className="content"><PageHead eyebrow="A little perspective" title="Progress" subtitle="A clear view of completed work, remaining effort, and how the day is moving."><button className="btn btn-danger" onClick={reset} data-testid="button-reset-demo"><RefreshCw size={14} /> Reset demo</button></PageHead>
    <div className="grid metrics-grid"><Metric label="Completion rate" value={`${rate}%`} foot={`${done.length} of ${total} tasks complete`} icon={<TrendingUp size={16} />} wash="#a995ff17" testId="metric-completion-rate" /><Metric label="Completed" value={String(done.length)} foot="Tasks checked off" icon={<CheckCircle2 size={16} />} wash="#6bc89417" testId="metric-completed" /><Metric label="Still open" value={String(open.length)} foot={`${open.filter(t => t.priority === 'high').length} high priority`} icon={<ListTodo size={16} />} wash="#f0b65d17" testId="metric-remaining" /><Metric label="Time logged" value={durationLabel(actual)} foot={`${durationLabel(estimated)} estimated across all tasks`} icon={<Clock3 size={16} />} wash="#5ac7d817" testId="metric-actual-time" /></div>
    <div className="dashboard-grid"><section className="card"><div className="card-head"><div><h2 className="card-title">Today’s completion</h2><div className="card-note">Progress is calculated from the tasks you marked complete.</div></div><span className="pill violet">{rate}%</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${rate}%` }} data-testid="progress-completion-bar" /></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 11 }}><span className="mini-stat">{done.length} done</span><span className="mini-stat">{open.length} remaining</span></div>
      <div style={{ marginTop: 23 }}><h3 className="section-heading">By area</h3>{categoriesDone.length ? categoriesDone.map(c => { const n = c.done + c.open; return <div className="list-row" key={c.category} data-testid={`progress-category-${c.category.toLowerCase()}`}><div style={{ flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}><span>{c.category}</span><span className="mini-stat">{c.done}/{n} complete</span></div><div className="progress-track" style={{ height: 4 }}><div className="progress-fill" style={{ width: `${n ? c.done / n * 100 : 0}%` }} /></div></div></div>; }) : <Empty title="No task data yet" text="Add tasks to see progress by area." icon={<TrendingUp size={17} />} />}</div>
    </section><section className="card"><div className="card-head"><div><h2 className="card-title">Time, honestly</h2><div className="card-note">Estimated against the time you actually logged.</div></div><Activity size={16} color="#5ac7d8" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div style={{ border: '1px solid #ffffff11', background: '#ffffff05', borderRadius: 11, padding: 14 }}><div className="mini-stat">Estimated</div><div style={{ font: '700 22px var(--app-font-display)', marginTop: 9 }} data-testid="value-estimated-time">{durationLabel(estimated)}</div></div><div style={{ border: '1px solid #ffffff11', background: '#ffffff05', borderRadius: 11, padding: 14 }}><div className="mini-stat">Actual completed</div><div style={{ font: '700 22px var(--app-font-display)', marginTop: 9, color: '#7fd5df' }} data-testid="value-actual-time">{durationLabel(actual)}</div></div></div>
      <div className="why-box" style={{ marginTop: 13 }}>{done.length ? 'Actual time defaults to the estimate when a task is completed. Edit a completed task to correct its actual minutes.' : 'Mark a task complete to start comparing actual time with your estimates.'}</div>
      <div style={{ marginTop: 21 }}><div className="card-head"><div><h3 className="section-heading" style={{ marginBottom: 0 }}>Completed work</h3><div className="card-note">Your effort counts.</div></div></div>{done.length ? done.map(t => <div className="list-row" key={t.id} data-testid={`completed-task-${t.id}`}><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><CheckCircle2 size={14} color="#75c995" /><span style={{ fontSize: 11 }}>{t.title}</span></div><span className="mini-stat">{durationLabel(t.actualMinutes ?? t.durationMinutes)}</span></div>) : <div className="mini-stat" style={{ padding: '10px 0' }}>No completed tasks yet.</div>}</div>
    </section></div>
  </main>;
}

function Empty({ title, text, icon, action }: { title: string; text: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><div style={{ color: '#d0d7e3', fontWeight: 700, fontSize: 12 }}>{title}</div><div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>{text}</div>{action && <div style={{ marginTop: 13 }}>{action}</div>}</div>;
}

function NotFound() {
  return <main className="content"><div className="card" style={{ maxWidth: 540, margin: '9vh auto', textAlign: 'center' }}><div className="empty-icon"><CircleHelp size={19} /></div><h1 className="page-title" style={{ fontSize: 25 }}>This page is off the plan.</h1><p className="page-subtitle" style={{ marginBottom: 18 }}>The page you’re looking for doesn’t exist.</p><Link className="btn btn-primary" href="/" data-testid="link-back-home">Back to today <ArrowRight size={14} /></Link></div></main>;
}

export default App;
